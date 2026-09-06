-- ============================================================================
--  ChollosBot ES · Datos iniciales
--  psql "$POSTGRES_DSN" -f db/seed.sql
--
--  IMPORTANTE: las comisiones son valores ORIENTATIVOS de referencia pública
--  (2025-2026). Ajústalas a las que figuren en tu panel de cada red antes de
--  usarlas para estimar ingresos. Los identificadores (AFF_ID, mid, programa)
--  se inyectan en tiempo de ejecución desde variables de entorno.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- COMERCIOS  ·  el "% de venta" de cada enlace
-- ---------------------------------------------------------------------------
INSERT INTO merchants (dominio, nombre, red, id_programa, comision_pct, plantilla_url,
                       param_subid, duracion_cookie_dias, fiabilidad, envia_a_espana,
                       recargo_import_pct)
VALUES
 ('amazon.es',        'Amazon España',   'amazon',       NULL,
  3.00, '{URL}?tag={AFF_ID}&linkCode=ll1&ascsubtag={SUBID}',           'ascsubtag',  1, 92, TRUE, 0),
 ('amazon.de',        'Amazon Alemania', 'amazon',       NULL,
  3.00, '{URL}?tag={AFF_ID}&linkCode=ll1&ascsubtag={SUBID}',           'ascsubtag',  1, 90, TRUE, 0),
 ('amazon.it',        'Amazon Italia',   'amazon',       NULL,
  3.00, '{URL}?tag={AFF_ID}&linkCode=ll1&ascsubtag={SUBID}',           'ascsubtag',  1, 90, TRUE, 0),
 ('amazon.fr',        'Amazon Francia',  'amazon',       NULL,
  3.00, '{URL}?tag={AFF_ID}&linkCode=ll1&ascsubtag={SUBID}',           'ascsubtag',  1, 90, TRUE, 0),
 ('aliexpress.com',   'AliExpress',      'aliexpress',   NULL,
  4.00, '{URL}?aff_fcid={SUBID}&aff_platform=portals',                 'aff_fcid',  30, 70, TRUE, 0),
 ('pccomponentes.com','PcComponentes',   'awin',         '15839',
  2.50, 'https://www.awin1.com/cread.php?awinmid={PROGRAMA}&awinaffid={AFF_ID}&clickref={SUBID}&ued={URL_ENC}',
  'clickref', 30, 90, TRUE, 0),
 ('mediamarkt.es',    'MediaMarkt',      'awin',         '10851',
  2.00, 'https://www.awin1.com/cread.php?awinmid={PROGRAMA}&awinaffid={AFF_ID}&clickref={SUBID}&ued={URL_ENC}',
  'clickref', 30, 88, TRUE, 0),
 ('elcorteingles.es', 'El Corte Inglés', 'awin',         '12345',
  4.00, 'https://www.awin1.com/cread.php?awinmid={PROGRAMA}&awinaffid={AFF_ID}&clickref={SUBID}&ued={URL_ENC}',
  'clickref', 30, 94, TRUE, 0),
 ('decathlon.es',     'Decathlon',       'awin',         '20194',
  5.00, 'https://www.awin1.com/cread.php?awinmid={PROGRAMA}&awinaffid={AFF_ID}&clickref={SUBID}&ued={URL_ENC}',
  'clickref', 30, 93, TRUE, 0),
 ('zalando.es',       'Zalando',         'awin',         '11256',
  6.00, 'https://www.awin1.com/cread.php?awinmid={PROGRAMA}&awinaffid={AFF_ID}&clickref={SUBID}&ued={URL_ENC}',
  'clickref', 30, 91, TRUE, 0),
 ('carrefour.es',     'Carrefour',       'tradedoubler', '2947381',
  2.00, 'https://clk.tradedoubler.com/click?p={PROGRAMA}&a={AFF_ID}&epi={SUBID}&url={URL_ENC}',
  'epi', 30, 89, TRUE, 0),
 ('fnac.es',          'Fnac',            'tradedoubler', '2841122',
  3.00, 'https://clk.tradedoubler.com/click?p={PROGRAMA}&a={AFF_ID}&epi={SUBID}&url={URL_ENC}',
  'epi', 30, 88, TRUE, 0),
 ('worten.es',        'Worten',          'admitad',      'wortenes',
  2.50, 'https://ad.admitad.com/g/{PROGRAMA}/?ulp={URL_ENC}&subid={SUBID}',
  'subid', 30, 85, TRUE, 0),
 ('sprinter.es',      'Sprinter',        'admitad',      'sprinteres',
  6.00, 'https://ad.admitad.com/g/{PROGRAMA}/?ulp={URL_ENC}&subid={SUBID}',
  'subid', 30, 87, TRUE, 0),
 ('ebay.es',          'eBay España',     'epn',          '5338000000',
  2.00, 'https://www.ebay.es/itm/{URL}?mkcid=1&mkrid=1185-53479-19255-0&campid={PROGRAMA}&customid={SUBID}&toolid=10001',
  'customid', 1, 75, TRUE, 0),
 ('temu.com',         'Temu',            'admitad',      'temuglobal',
  5.00, 'https://ad.admitad.com/g/{PROGRAMA}/?ulp={URL_ENC}&subid={SUBID}',
  'subid', 30, 55, TRUE, 0)
ON CONFLICT (dominio) DO UPDATE
SET nombre = EXCLUDED.nombre,
    red = EXCLUDED.red,
    comision_pct = EXCLUDED.comision_pct,
    plantilla_url = EXCLUDED.plantilla_url;

-- Comisiones por categoría (Amazon Partners paga por categoría, no plano)
INSERT INTO comisiones_categoria (dominio, categoria, comision_pct) VALUES
 ('amazon.es', 'moda',            10.00),
 ('amazon.es', 'belleza',          8.00),
 ('amazon.es', 'hogar',            6.00),
 ('amazon.es', 'deporte',          6.00),
 ('amazon.es', 'juguetes',         3.00),
 ('amazon.es', 'informatica',      2.50),
 ('amazon.es', 'electronica',      2.00),
 ('amazon.es', 'videojuegos',      2.00),
 ('amazon.es', 'movil',            2.00),
 ('amazon.es', 'electrodomesticos',3.00),
 ('amazon.es', 'alimentacion',     3.50),
 ('amazon.es', 'libros',           4.00)
ON CONFLICT (dominio, categoria) DO UPDATE SET comision_pct = EXCLUDED.comision_pct;

-- ---------------------------------------------------------------------------
-- FUENTES
-- ---------------------------------------------------------------------------
INSERT INTO fuentes (nombre, tipo, url, config, pais, dominio_objetivo, prioridad, activo) VALUES
 ('Amazon PA-API · Informática',  'amazon_paapi', NULL,
  '{"keywords":"ofertas informatica","searchIndex":"Computers","minSavingPercent":25,"itemCount":10,"host":"webservices.amazon.es","region":"eu-west-1","marketplace":"www.amazon.es"}'::jsonb,
  'ES', 'amazon.es', 200, TRUE),
 ('Amazon PA-API · Electrónica',  'amazon_paapi', NULL,
  '{"keywords":"ofertas electronica","searchIndex":"Electronics","minSavingPercent":25,"itemCount":10,"host":"webservices.amazon.es","region":"eu-west-1","marketplace":"www.amazon.es"}'::jsonb,
  'ES', 'amazon.es', 200, TRUE),
 ('Amazon PA-API · Hogar',        'amazon_paapi', NULL,
  '{"keywords":"ofertas hogar","searchIndex":"HomeGarden","minSavingPercent":30,"itemCount":10,"host":"webservices.amazon.es","region":"eu-west-1","marketplace":"www.amazon.es"}'::jsonb,
  'ES', 'amazon.es', 180, TRUE),
 ('Awin · Datafeed PcComponentes','feed_afiliado', 'https://productdata.awin.com/datafeed/download/apikey/{AWIN_FEED_KEY}/language/es/fid/15839/columns/product_name,description,merchant_image_url,aw_deep_link,merchant_product_id,search_price,store_price,ean,brand_name,merchant_category,in_stock/format/json/delimiter/%2C/compression/gzip/',
  '{"formato":"json","mapeo":{"titulo":"product_name","descripcion":"description","imagen":"merchant_image_url","url":"aw_deep_link","precio":"search_price","precio_anterior":"store_price","ean":"ean","marca":"brand_name","categoria":"merchant_category","stock":"in_stock"}}'::jsonb,
  'ES', 'pccomponentes.com', 150, FALSE),
 ('RSS · Ofertas tecnología',     'rss', 'https://www.xataka.com/tag/ofertas/rss',
  '{"solo_con_precio":true}'::jsonb, 'ES', NULL, 90, TRUE),
 ('AliExpress · Hot products',    'api', 'https://api-sg.aliexpress.com/sync',
  '{"metodo":"aliexpress.affiliate.hotproduct.query","ship_to_country":"ES","target_currency":"EUR","page_size":20}'::jsonb,
  'INT', 'aliexpress.com', 120, FALSE)
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------------
-- CANALES DE TELEGRAM
--   Sustituye los chat_id por los reales (@nombre_canal o -100xxxxxxxxxx).
-- ---------------------------------------------------------------------------
INSERT INTO canales (nombre, chat_id, categorias, score_minimo, max_por_hora, activo) VALUES
 ('General',      '@tu_canal_chollos',      '{}',                                    62, 12, TRUE),
 ('Tecnología',   '@tu_canal_tech',         '{informatica,electronica,movil,videojuegos}', 70,  6, FALSE),
 ('Hogar',        '@tu_canal_hogar',        '{hogar,electrodomesticos,jardin}',      70,  4, FALSE),
 ('Moda y Deporte','@tu_canal_moda',        '{moda,deporte,belleza}',                70,  4, FALSE),
 ('Admin',        '@tu_canal_admin',        '{}',                                   100,  6, TRUE)
ON CONFLICT DO NOTHING;
