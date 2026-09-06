-- ============================================================================
--  ChollosBot ES · Esquema PostgreSQL
--  Motor de datos del sistema n8n de agregación, clasificación y difusión
--  automática de ofertas (España + tiendas internacionales que envían a ES).
--
--  Uso:  psql "$POSTGRES_DSN" -f db/schema.sql
-- ============================================================================

-- Los NOTICE de los DROP ... IF EXISTS son ruido; los WARNING siguen visibles.
SET client_min_messages = WARNING;

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- búsqueda por similitud de texto
CREATE EXTENSION IF NOT EXISTS unaccent;     -- normalización de acentos

-- ---------------------------------------------------------------------------
-- 1. FUENTES DE OFERTAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuentes (
    id              BIGSERIAL PRIMARY KEY,
    nombre          TEXT NOT NULL UNIQUE,
    -- rss | amazon_paapi | feed_afiliado | html | api
    tipo            TEXT NOT NULL,
    url             TEXT,
    -- Parámetros específicos: keywords PA-API, selectores CSS, mapeo de feed…
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    pais            TEXT NOT NULL DEFAULT 'ES',
    -- Se usa para asignar la fuente al normalizar (host del enlace)
    dominio_objetivo TEXT,
    prioridad       INT  NOT NULL DEFAULT 100,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_ejecucion TIMESTAMPTZ,
    ultimo_error    TEXT,
    creada_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. COMERCIOS Y PROGRAMAS DE AFILIACIÓN  (el "% de venta")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchants (
    dominio         TEXT PRIMARY KEY,              -- p.ej. 'amazon.es'
    nombre          TEXT NOT NULL,
    -- amazon | awin | tradedoubler | admitad | aliexpress | impact | epn | directo
    red             TEXT NOT NULL,
    id_programa     TEXT,                          -- awinmid / program id / campaign code
    -- Comisión media negociada. Se puede afinar por categoría en comisiones_categoria
    comision_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- Plantilla de deeplink. Marcadores: {URL} {URL_ENC} {AFF_ID} {PROGRAMA} {SUBID}
    plantilla_url   TEXT NOT NULL,
    param_subid     TEXT,                          -- ascsubtag | clickref | epi | subid
    duracion_cookie_dias INT DEFAULT 30,
    -- 0..100. Penaliza marketplaces con vendedores poco fiables.
    fiabilidad      INT NOT NULL DEFAULT 80,
    envia_a_espana  BOOLEAN NOT NULL DEFAULT TRUE,
    -- Coste medio de aduanas/IVA a aplicar sobre el precio para tiendas extra-UE
    recargo_import_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Comisión afinada por (merchant, categoría). Amazon paga 1%–10% según categoría.
CREATE TABLE IF NOT EXISTS comisiones_categoria (
    dominio         TEXT NOT NULL REFERENCES merchants(dominio) ON DELETE CASCADE,
    categoria       TEXT NOT NULL,
    comision_pct    NUMERIC(5,2) NOT NULL,
    PRIMARY KEY (dominio, categoria)
);

-- ---------------------------------------------------------------------------
-- 3. OFERTAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ofertas (
    id              BIGSERIAL PRIMARY KEY,
    -- sha256(dominio | clave_producto). Clave de deduplicación entre fuentes.
    hash_dedupe     TEXT NOT NULL UNIQUE,
    -- ASIN, EAN o slug canónico. Permite unir el histórico entre fuentes.
    clave_producto  TEXT NOT NULL,
    fuente          TEXT,
    merchant        TEXT,
    dominio         TEXT,
    url_original    TEXT NOT NULL,
    url_afiliado    TEXT,
    url_corta       TEXT,                          -- /r/<id> del redirector
    titulo          TEXT NOT NULL,
    titulo_limpio   TEXT,                          -- reescrito por la IA
    descripcion     TEXT,
    imagen          TEXT,
    marca           TEXT,
    ean             TEXT,
    asin            TEXT,
    categoria       TEXT,
    subcategoria    TEXT,
    categoria_fuente TEXT,
    pais            TEXT DEFAULT 'ES',

    precio_actual   NUMERIC(12,2) NOT NULL,
    precio_anterior NUMERIC(12,2),                 -- PVP declarado por la tienda
    precio_referencia NUMERIC(12,2),               -- mediana 90d propia (anti-PVP inflado)
    precio_min_historico NUMERIC(12,2),
    precio_min_30d  NUMERIC(12,2),                 -- exigido por la Directiva Omnibus
    envio_coste     NUMERIC(12,2) NOT NULL DEFAULT 0,
    envio_gratis    BOOLEAN NOT NULL DEFAULT FALSE,
    precio_total    NUMERIC(12,2),                 -- precio + envío + import - cupón
    moneda          TEXT NOT NULL DEFAULT 'EUR',
    cupon           TEXT,
    cupon_descuento NUMERIC(12,2) NOT NULL DEFAULT 0,

    descuento_pct       NUMERIC(5,2),              -- el que anuncia la tienda
    descuento_real_pct  NUMERIC(5,2),              -- vs. nuestro histórico real
    es_minimo_historico BOOLEAN NOT NULL DEFAULT FALSE,
    pvp_inflado         BOOLEAN NOT NULL DEFAULT FALSE,

    score           INT NOT NULL DEFAULT 0,        -- 0..100
    score_detalle   JSONB NOT NULL DEFAULT '{}'::jsonb,
    veredicto_ia    TEXT,
    riesgos         TEXT[],
    hashtags        TEXT[],
    mensaje         TEXT,                          -- copy final para Telegram

    red_afiliado    TEXT,
    comision_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    comision_estimada NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- nueva | clasificada | publicada | descartada | caducada
    estado          TEXT NOT NULL DEFAULT 'nueva',
    motivo_descarte TEXT,
    stock           BOOLEAN NOT NULL DEFAULT TRUE,
    caduca_en       TIMESTAMPTZ,

    canal_chat_id   TEXT,
    telegram_message_id BIGINT,
    publicada_en    TIMESTAMPTZ,
    visto_ultima_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
    verificada_en   TIMESTAMPTZ,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    creada_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ofertas_estado       ON ofertas (estado, score DESC);
CREATE INDEX IF NOT EXISTS idx_ofertas_clave        ON ofertas (clave_producto);
CREATE INDEX IF NOT EXISTS idx_ofertas_publicada    ON ofertas (publicada_en DESC);
CREATE INDEX IF NOT EXISTS idx_ofertas_dominio      ON ofertas (dominio);
CREATE INDEX IF NOT EXISTS idx_ofertas_titulo_trgm  ON ofertas USING gin (titulo gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. HISTÓRICO DE PRECIOS  (la ventaja competitiva núcleo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS precios_historico (
    id              BIGSERIAL PRIMARY KEY,
    clave_producto  TEXT NOT NULL,
    dominio         TEXT,
    precio          NUMERIC(12,2) NOT NULL,
    precio_total    NUMERIC(12,2),
    moneda          TEXT NOT NULL DEFAULT 'EUR',
    fuente          TEXT,
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Columna propia en vez de una expresión sobre `fecha`: el casting de
    -- timestamptz a date depende de la zona horaria y no es IMMUTABLE, así que
    -- no puede indexarse. CURRENT_DATE como DEFAULT sí es válido.
    fecha_dia       DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_hist_clave_fecha ON precios_historico (clave_producto, fecha DESC);

-- Una muestra por producto/día: evita inflar el histórico con lecturas repetidas
CREATE UNIQUE INDEX IF NOT EXISTS uq_hist_dia
    ON precios_historico (clave_producto, dominio, fecha_dia, precio);

-- ---------------------------------------------------------------------------
-- 5. SUSCRIPTORES Y ALERTAS PERSONALIZADAS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suscriptores (
    id              BIGSERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    chat_id         TEXT NOT NULL,
    nombre          TEXT,
    idioma          TEXT DEFAULT 'es',
    categorias      TEXT[] NOT NULL DEFAULT '{}',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    -- Consentimiento explícito RGPD para mensajes directos
    consentimiento_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alertas (
    id              BIGSERIAL PRIMARY KEY,
    suscriptor_id   BIGINT NOT NULL REFERENCES suscriptores(id) ON DELETE CASCADE,
    texto           TEXT,                          -- palabra clave
    categoria       TEXT,
    precio_max      NUMERIC(12,2),
    descuento_min   NUMERIC(5,2) DEFAULT 0,
    activa          BOOLEAN NOT NULL DEFAULT TRUE,
    creada_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_activas ON alertas (activa) WHERE activa;

CREATE TABLE IF NOT EXISTS envios_alerta (
    alerta_id       BIGINT NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
    oferta_id       BIGINT NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
    enviado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alerta_id, oferta_id)
);

-- ---------------------------------------------------------------------------
-- 6. CANALES Y PUBLICACIONES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canales (
    id              BIGSERIAL PRIMARY KEY,
    nombre          TEXT NOT NULL,
    chat_id         TEXT NOT NULL,
    categorias      TEXT[] NOT NULL DEFAULT '{}',  -- vacío = canal general
    score_minimo    INT NOT NULL DEFAULT 60,
    max_por_hora    INT NOT NULL DEFAULT 12,
    activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS publicaciones (
    id              BIGSERIAL PRIMARY KEY,
    oferta_id       BIGINT NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
    canal_chat_id   TEXT NOT NULL,
    message_id      BIGINT,
    tipo            TEXT NOT NULL DEFAULT 'canal', -- canal | alerta
    publicada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pub_oferta ON publicaciones (oferta_id);

-- ---------------------------------------------------------------------------
-- 7. ATRIBUCIÓN: CLICS Y CONVERSIONES (% de venta real)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clicks (
    id              BIGSERIAL PRIMARY KEY,
    oferta_id       BIGINT REFERENCES ofertas(id) ON DELETE SET NULL,
    subid           TEXT NOT NULL,                 -- o<oferta>-c<canal>-<nonce>
    canal           TEXT,
    -- Hash del user-agent + IP; nunca datos personales en claro (RGPD)
    huella          TEXT,
    referer         TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clicks_subid ON clicks (subid);
CREATE INDEX IF NOT EXISTS idx_clicks_fecha ON clicks (creado_en DESC);

CREATE TABLE IF NOT EXISTS conversiones (
    id              BIGSERIAL PRIMARY KEY,
    red             TEXT NOT NULL,
    id_externo      TEXT NOT NULL,
    subid           TEXT,
    oferta_id       BIGINT REFERENCES ofertas(id) ON DELETE SET NULL,
    importe_venta   NUMERIC(12,2),
    comision        NUMERIC(12,2),
    comision_pct    NUMERIC(5,2),
    estado          TEXT DEFAULT 'pendiente',      -- pendiente | aprobada | rechazada
    fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (red, id_externo)
);

-- ---------------------------------------------------------------------------
-- 8. VISTAS DE NEGOCIO
-- ---------------------------------------------------------------------------

-- Rendimiento por oferta: clics, ventas y EPC (earnings per click).
-- Las métricas se agregan por separado ANTES de unirlas: un LEFT JOIN directo
-- de clicks contra conversiones multiplicaría las filas (n clics × m ventas)
-- e inflaría la comisión y el EPC.
CREATE OR REPLACE VIEW v_rendimiento_ofertas AS
SELECT o.id,
       o.titulo,
       o.dominio,
       o.categoria,
       o.score,
       o.precio_actual,
       o.comision_pct,
       o.comision_estimada,
       COALESCE(c.clics, 0)                                AS clics,
       COALESCE(v.ventas, 0)                               AS ventas,
       COALESCE(v.comision_real, 0)                        AS comision_real,
       ROUND(COALESCE(v.comision_real, 0)
             / NULLIF(c.clics, 0), 3)                      AS epc,
       ROUND(100.0 * COALESCE(v.ventas, 0)
             / NULLIF(c.clics, 0), 2)                      AS tasa_conversion_pct
FROM ofertas o
LEFT JOIN (
    SELECT oferta_id, COUNT(*) AS clics
    FROM clicks GROUP BY oferta_id
) c ON c.oferta_id = o.id
LEFT JOIN (
    SELECT oferta_id, COUNT(*) AS ventas, SUM(comision) AS comision_real
    FROM conversiones WHERE estado <> 'rechazada' GROUP BY oferta_id
) v ON v.oferta_id = o.id
WHERE o.estado = 'publicada';

-- Cuadro de mando diario
CREATE OR REPLACE VIEW v_metricas_diarias AS
SELECT d::date AS dia,
       (SELECT COUNT(*) FROM ofertas   WHERE creada_en::date   = d::date) AS ofertas_captadas,
       (SELECT COUNT(*) FROM ofertas   WHERE publicada_en::date = d::date) AS ofertas_publicadas,
       (SELECT COUNT(*) FROM clicks    WHERE creado_en::date    = d::date) AS clics,
       (SELECT COUNT(*) FROM conversiones WHERE fecha::date     = d::date) AS ventas,
       (SELECT COALESCE(SUM(comision),0) FROM conversiones
          WHERE fecha::date = d::date AND estado <> 'rechazada')          AS comision_eur,
       (SELECT COUNT(*) FROM suscriptores WHERE creado_en::date = d::date) AS altas_suscriptores
FROM generate_series(now() - interval '30 days', now(), interval '1 day') d;

-- Fiabilidad observada por comercio (para ajustar el scoring)
CREATE OR REPLACE VIEW v_fiabilidad_merchants AS
SELECT m.dominio,
       m.nombre,
       m.comision_pct,
       COUNT(o.id)                                        AS publicadas_90d,
       AVG(o.score)::NUMERIC(5,1)                         AS score_medio,
       COUNT(*) FILTER (WHERE o.estado = 'caducada')      AS caducadas,
       ROUND(100.0 * COUNT(*) FILTER (WHERE o.estado = 'caducada')
             / NULLIF(COUNT(o.id), 0), 1)                 AS pct_caducidad
FROM merchants m
LEFT JOIN ofertas o
       ON o.dominio = m.dominio
      AND o.publicada_en > now() - interval '90 days'
GROUP BY m.dominio, m.nombre, m.comision_pct;

-- ---------------------------------------------------------------------------
-- 9. MANTENIMIENTO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tg_ofertas_actualizada() RETURNS trigger AS $$
BEGIN
    NEW.actualizada_en := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ofertas_actualizada ON ofertas;
CREATE TRIGGER trg_ofertas_actualizada
    BEFORE UPDATE ON ofertas
    FOR EACH ROW EXECUTE FUNCTION tg_ofertas_actualizada();
