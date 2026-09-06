# ChollosBot ES · sistema n8n de ofertas verificadas

Flujo completo en **n8n** que recolecta ofertas en España (incluidas tiendas
internacionales que envían aquí, como Amazon .de/.it/.fr, AliExpress o eBay), **verifica que
el descuento es real**, las clasifica con IA, las publica automáticamente en un bot y canal
de Telegram, y monetiza cada enlace con comisión por venta y atribución completa.

```
Fuentes → Normalización → Precio real vs histórico → IA → Score → Telegram → Clic → Venta
```

---

## Qué resuelve

Los agregadores de ofertas basados en votos comparten un problema: **el descuento que
anuncian se calcula sobre el PVP que declara la tienda**, y ese PVP se infla con facilidad.
Un producto que lleva medio año a 249 € aparece como "419 € → 249 €, −41 %", y la comunidad
vota el porcentaje, no el precio.

Este sistema guarda su propio histórico de precios y calcula el descuento contra la **mediana
de 90 días** y el **mínimo de 30 días** que exige la Directiva Omnibus. Si el PVP no cuadra
con lo observado, la oferta se marca, se penaliza y el aviso lo dice. Si el descuento real no
llega al 15 %, no se publica — aunque la tienda anuncie un −60 %.

Comparativa detallada, con lo que el sistema hace mejor **y lo que no puede igualar**, en
[`docs/ventajas-vs-chollometro.md`](docs/ventajas-vs-chollometro.md).

---

## Los seis workflows

| # | Workflow | Disparador | Función |
|---|---|---|---|
| 01 | [Ingesta multifuente](n8n/workflows/01-ingesta-ofertas.json) | cada 15 min | Amazon PA-API 5.0 (firma SigV4), datafeeds de Awin/Tradedoubler/Admitad, RSS y JSON-LD → esquema común, deduplicación e histórico de precio |
| 02 | [Clasificación y scoring](n8n/workflows/02-clasificacion-scoring.json) | cada 5 min | Descuento real, coste total aterrizado, clasificación con Claude, score 0-100 auditable y construcción del enlace monetizado |
| 03 | [Publicación y alertas](n8n/workflows/03-publicacion-telegram.json) | cada 10 min | Publica en el canal con control de ruido y avisa por privado a quien tenga una alerta que encaje |
| 04 | [Bot de Telegram](n8n/workflows/04-bot-telegram.json) | webhook | `/alerta` `/misalertas` `/top` `/buscar` `/categorias` `/baja` + botones de histórico y alerta |
| 05 | [Vigencia e informes](n8n/workflows/05-vigencia-e-informes.json) | cada hora / 08:00 | Marca las ofertas caducadas **editando el mensaje ya publicado**; informe diario de negocio |
| 06 | [Redirector y postback](n8n/workflows/06-redirector-y-postback.json) | webhooks | `/r/:id` registra el clic con SubID y redirige; `/postback/:red` recibe las ventas confirmadas |

Diagrama de flujo y decisiones de diseño en [`docs/arquitectura.md`](docs/arquitectura.md).

---

## El enlace con % de venta

Cada botón «🛒 Ver oferta» apunta a un redirector propio, no directamente a la red de
afiliación:

```
/webhook/r/18422
   → registra el clic (sin IP ni user-agent en claro: hash con sal)
   → genera SubID único      o18422-cgeneral-7f3a1b
   → 302 al deeplink         awin1.com/cread.php?...&clickref=o18422-cgeneral-7f3a1b
   → compra
   → POST /webhook/postback/awin  con ese mismo SubID, el importe y la comisión
   → conversiones → EPC por oferta, canal y categoría
```

Ventaja operativa: se puede **cambiar de red de afiliación sin reeditar los mensajes ya
publicados**, y cada venta queda atribuida a la oferta concreta que la generó, lo que permite
medir el EPC real por categoría en vez de estimarlo.

Redes soportadas de serie: Amazon Partners, Awin, Tradedoubler, Admitad, AliExpress Portals,
eBay Partner Network e Impact, con sus plantillas de deeplink y su parámetro de SubID en
[`config/afiliados.json`](config/afiliados.json).

**La comisión pesa como máximo 5 puntos sobre 100 en el score.** Es un desempate, nunca el
criterio principal: una oferta sin comisión y con buen descuento gana siempre a una con 10 %
de comisión y descuento falso. Detalle en
[`docs/monetizacion-y-afiliados.md`](docs/monetizacion-y-afiliados.md).

---

## Cómo se puntúa una oferta

| Componente | Máx. | Fuente |
|---|---:|---|
| Descuento real verificado | 35 | histórico propio de 90 días |
| Mínimo histórico / mejora del mínimo 30 d | 20 | `precios_historico` |
| Fiabilidad del comercio | 15 | `merchants` + caducidad observada |
| Calidad producto/precio | 15 | Claude |
| Interés estimado en España | 10 | Claude |
| Comisión de afiliación | 5 | `merchants` / `comisiones_categoria` |
| Penalizaciones | −30 | riesgos, PVP inflado, falta de histórico |

El desglose se guarda en `ofertas.score_detalle`, así que siempre se puede explicar por qué
una oferta se publicó o se descartó.

---

## Puesta en marcha

```bash
cp .env.example .env
openssl rand -hex 32   # N8N_ENCRYPTION_KEY
openssl rand -hex 16   # HASH_SALT
openssl rand -hex 16   # POSTBACK_TOKEN
$EDITOR .env           # token del bot, canales, IDs de afiliación

docker compose up -d
./scripts/import-workflows.sh
```

Después, en n8n: crear las tres credenciales (`Postgres ChollosBot`, `Telegram ChollosBot`,
`Anthropic API (x-api-key)`) y activar los seis workflows.

Guía completa, rodaje de las dos primeras semanas y resolución de problemas en
[`docs/despliegue.md`](docs/despliegue.md).

---

## Verificación

```bash
./scripts/verificar.sh
```

Regenera los workflows y comprueba, contra un PostgreSQL efímero:

- 6 workflows con JSON válido y conexiones coherentes,
- 28 nodos Code y 61 expresiones con sintaxis JavaScript correcta,
- las 29 consultas SQL de los nodos Postgres,
- 31 comprobaciones funcionales del flujo de datos de extremo a extremo.

La prueba de `tests/test_flujo_datos.py` **extrae las consultas de los propios JSON de los
workflows** y las ejecuta con datos reales: verifica la deduplicación, la reapertura por
bajada de precio, el cálculo de la mediana histórica, el control de ruido en la publicación,
el casado de alertas, la idempotencia del postback y el cálculo del EPC. Si alguien cambia
una consulta y rompe el flujo, la prueba falla.

---

## Estructura

```
n8n/workflows/     6 workflows listos para importar
tools/             generador de los workflows (fuente de verdad del JavaScript)
db/                esquema PostgreSQL, datos iniciales y vistas de negocio
config/            taxonomía de categorías, redes de afiliación y umbrales
scripts/           importación y verificación
tests/             prueba funcional de extremo a extremo
docs/              arquitectura · ventajas · monetización · despliegue · legal
```

### Modificar un workflow

Los JSON se generan desde `tools/build_workflows.py`: escribir JavaScript embebido dentro de
un JSON a mano es frágil, así que la fuente de verdad es ese fichero.

```bash
$EDITOR tools/build_workflows.py
./scripts/verificar.sh          # regenera y valida
```

Si prefieres editar en la interfaz de n8n, exporta el workflow y vuelca los cambios al
generador para no perderlos en la siguiente regeneración.

---

## Antes de publicar nada

El sistema toca tres áreas reguladas y la documentación las cubre en
[`docs/legal-y-cumplimiento.md`](docs/legal-y-cumplimiento.md):

- **Declaración de afiliación** — implementada en cada mensaje; falta añadirla a la
  descripción del canal, junto con la mención literal que exige Amazon Partners.
- **RGPD** — consentimiento por `/start`, datos mínimos, clics sin IP ni user-agent en claro,
  purga automática y baja por `/baja`. Falta publicar una política de privacidad.
- **Obtención de datos** — solo APIs oficiales, datafeeds contratados, RSS y JSON-LD
  publicado. Revisa `robots.txt` y las condiciones de cada sitio antes de darlo de alta como
  fuente `html`.

Las comisiones de `db/seed.sql` son **valores orientativos públicos**: sustitúyelas por las
de tu panel antes de proyectar ingresos.

---

## Estado y límites conocidos

- Los workflows están validados estructural y sintácticamente, y toda la capa SQL se prueba
  contra un PostgreSQL real. **Las integraciones externas (PA-API, Bot API, Anthropic, redes
  de afiliación) no se pueden probar sin credenciales**: requieren el rodaje descrito en el
  paso 8 del despliegue.
- El sistema necesita entre dos y tres semanas acumulando precios antes de que el descuento
  verificado sea fiable. Hasta entonces publica menos y penaliza la falta de histórico.
- El fan-out de alertas privadas está pensado para miles de suscriptores, no decenas de
  miles; a partir de ahí hay que trocear los envíos.
- El identificador de programa (`id_programa`) de los comercios del seed es de ejemplo:
  consúltalo en el panel de tu red antes de activarlos.
