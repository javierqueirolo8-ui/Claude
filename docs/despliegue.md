# Despliegue paso a paso

Tiempo estimado: **45–60 minutos** si ya tienes las cuentas de afiliación. Las altas en las
redes tardan de 1 a 5 días laborables, así que conviene solicitarlas antes de empezar.

---

## 1. Requisitos

- Docker y Docker Compose.
- Un dominio con HTTPS apuntando al servidor. **No es opcional**: Telegram exige HTTPS para
  los webhooks y las redes de afiliación no envían postbacks a HTTP.
- Cuenta en al menos un programa de afiliación.
- Clave de API de Anthropic.

Para desarrollo local basta un túnel:

```bash
cloudflared tunnel --url http://localhost:5678     # devuelve una URL https temporal
```

---

## 2. Crear el bot y los canales de Telegram

1. Habla con [@BotFather](https://t.me/BotFather) → `/newbot` → guarda el token.
2. `/setprivacy` → **Disable**, para que el bot pueda leer los comandos en grupos.
3. Crea los canales: uno público de ofertas y otro privado de administración.
4. Añade el bot como **administrador** de ambos, con permiso para publicar y editar
   mensajes. Sin permiso de edición no puede marcar las ofertas caducadas.
5. Anota los identificadores: `@nombre_del_canal` si es público, o el `-100…` que devuelve
   `https://api.telegram.org/bot<TOKEN>/getUpdates` tras publicar algo en el canal.

---

## 3. Configurar el entorno

```bash
cp .env.example .env
openssl rand -hex 32   # -> N8N_ENCRYPTION_KEY
openssl rand -hex 16   # -> HASH_SALT
openssl rand -hex 16   # -> POSTBACK_TOKEN
$EDITOR .env
```

Rellena como mínimo: `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`, `PUBLIC_BASE_URL`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ADMIN`, `HASH_SALT`, `POSTBACK_TOKEN` y al menos un
identificador de afiliación.

> `N8N_ENCRYPTION_KEY` cifra las credenciales guardadas en n8n. Si la pierdes o la cambias,
> hay que volver a introducir todas las credenciales. Guárdala fuera del servidor.

---

## 4. Levantar la pila

```bash
docker compose up -d
docker compose logs -f n8n        # espera a "Editor is now accessible via..."
```

El esquema y los datos iniciales se aplican solos al crear el volumen de Postgres. Para
comprobarlo:

```bash
docker compose exec postgres psql -U chollos -d chollos -c "\dt"
```

Si el volumen ya existía, aplícalos a mano:

```bash
docker compose exec -T postgres psql -U chollos -d chollos < db/schema.sql
docker compose exec -T postgres psql -U chollos -d chollos < db/seed.sql
```

---

## 5. Importar los workflows

```bash
./scripts/import-workflows.sh
```

O desde la interfaz: **Workflows → ⋯ → Import from File**, uno por uno.

---

## 6. Crear las tres credenciales

En **Credentials → Add credential**. Los nombres deben coincidir exactamente, porque los
workflows los referencian:

| Nombre | Tipo | Configuración |
|---|---|---|
| `Postgres ChollosBot` | Postgres | host `postgres`, base `chollos`, usuario y contraseña del `.env`, esquema `public` |
| `Telegram ChollosBot` | Telegram | el token de @BotFather |
| `Anthropic API (x-api-key)` | Header Auth | nombre `x-api-key`, valor: tu clave de Anthropic |

Después abre cada workflow y confirma que los nodos tienen la credencial asignada (los
importados muestran un aviso si no la encuentran).

---

## 7. Ajustar los canales y las fuentes

```sql
-- Sustituye los canales de ejemplo por los tuyos
UPDATE canales SET chat_id = '@mi_canal_ofertas'  WHERE nombre = 'General';
UPDATE canales SET chat_id = '-1001234567890'     WHERE nombre = 'Admin';

-- Activa las fuentes que tengas configuradas
UPDATE fuentes SET activo = TRUE  WHERE nombre LIKE 'Amazon PA-API%';
UPDATE fuentes SET activo = FALSE WHERE nombre LIKE 'Awin · Datafeed%';  -- hasta tener la clave

-- Comisiones REALES de tu panel, no las orientativas del seed
UPDATE merchants SET comision_pct = 3.5 WHERE dominio = 'pccomponentes.com';
```

---

## 8. Activar y comprobar

Activa los seis workflows con el interruptor de la esquina superior derecha.

```bash
# El redirector responde 302
curl -I "$PUBLIC_BASE_URL/webhook/r/1"

# El webhook del bot está registrado en Telegram
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | jq
```

Después, en Telegram: `/start` al bot, luego `/ayuda` y `/top`.

Primera ejecución manual, en orden: **01 → 02 → 03**. Con el botón *Execute workflow* de
cada uno se ve el recorrido de los datos nodo a nodo y es la forma más rápida de detectar
una credencial mal puesta.

---

## 9. Rodaje: las dos primeras semanas

El sistema **necesita histórico para funcionar bien**. Al principio no tiene con qué
comparar, así que arranca en modo conservador:

```sql
-- Semana 1-2: exigir más descuento y publicar menos, mientras se acumula histórico
UPDATE canales SET score_minimo = 72, max_por_hora = 6;
```

A partir de la tercera semana, cuando `precios_historico` tenga suficientes muestras:

```sql
-- Cuántos productos tienen ya histórico utilizable
SELECT count(*) FILTER (WHERE n >= 3) AS con_historico, count(*) AS total
FROM (SELECT clave_producto, count(*) n FROM precios_historico GROUP BY 1) x;

UPDATE canales SET score_minimo = 62, max_por_hora = 12;
```

---

## 10. Operación diaria

El informe de las 08:00 en el canal de administración es el panel de control. Consultas
útiles para diagnosticar:

```sql
-- ¿Por qué se descarta lo que se descarta?
SELECT motivo_descarte, count(*) FROM ofertas
WHERE estado='descartada' AND creada_en > now() - interval '7 days'
GROUP BY 1 ORDER BY 2 DESC;

-- Rendimiento por comercio: mucho clic y poca venta = precio desactualizado
SELECT * FROM v_rendimiento_ofertas ORDER BY clics DESC LIMIT 20;

-- Comercios cuyas ofertas caducan mucho: bajar su fiabilidad
SELECT * FROM v_fiabilidad_merchants ORDER BY pct_caducidad DESC NULLS LAST;

-- Evolución de 30 días
SELECT * FROM v_metricas_diarias ORDER BY dia DESC LIMIT 30;
```

Ajustes según lo que veas:

| Síntoma | Ajuste |
|---|---|
| Se publica poco | Bajar `canales.score_minimo`, activar más fuentes |
| Se publica basura | Subir `score_minimo`; bajar `merchants.fiabilidad` del comercio culpable |
| Muchas caducadas | Bajar el intervalo de verificación del WF05 a 30 min |
| EPC bajo en una categoría | Subir su score mínimo o dejar de publicarla |
| Muchos `pvp_inflado` de un comercio | Bajar su `fiabilidad` |

---

## 11. Copias de seguridad

Lo irreemplazable es `precios_historico`: se tarda meses en reconstruirlo.

```bash
docker compose exec -T postgres pg_dump -U chollos chollos | gzip > copia-$(date +%F).sql.gz
```

Programa esto a diario. Guarda también `.env` y `N8N_ENCRYPTION_KEY` fuera del servidor.

---

## Problemas frecuentes

| Síntoma | Causa habitual | Solución |
|---|---|---|
| `crypto is not defined` | Falta la variable en n8n | `NODE_FUNCTION_ALLOW_BUILTIN=crypto` y reiniciar |
| PA-API devuelve 401 | Firma o marketplace incorrectos | Verifica clave/secreto y que la región case con el marketplace (`eu-west-1` ↔ `www.amazon.es`) |
| PA-API devuelve `TooManyRequests` | Cuota de cuenta nueva | Espacia las fuentes; la cuota sube con las ventas generadas |
| El bot no responde | Webhook sin registrar | Guarda de nuevo el WF04; revisa `getWebhookInfo` |
| `chat not found` | El bot no es admin del canal | Añádelo como administrador |
| No se marca ninguna caducada | El bot no puede editar | Dale permiso de edición de mensajes |
| El postback devuelve 401 | Token ausente o distinto | Revisa `POSTBACK_TOKEN` en la URL configurada en la red |
| Se descarta casi todo | Aún no hay histórico | Normal en el rodaje; ver el paso 9 |
