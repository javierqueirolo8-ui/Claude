# Cobranza asistida de facturas vencidas · Uruguay

**Estado: diseño, para el Punto de control 2.** No se ha construido, activado ni ejecutado nada, no
se ha tocado producción y **no se ha contactado a nadie**.

Servicio para pymes uruguayas que **facturan a crédito a otras empresas** y pierden caja y tiempo
porque nadie reclama a tiempo. Cada semana, a partir de una exportación que el propio cliente deja
en una carpeta compartida **de solo lectura**, se calcula la antigüedad de cada factura vencida y
se prepara un informe con borradores de mensaje. Lo recibe **únicamente el dueño o el
administrativo del cliente**, que revisa y envía él mismo. En la v1 el sistema no escribe a ningún
deudor.

## Por qué este nicho

- **Dolor medido, pero en España:** el período medio de pago de las empresas fue de 80,5 días frente a
  60 legales y solo el 30,4 % de lo facturado se cobró a tiempo (Observatorio de la Morosidad de
  CEPYME, abril de 2026, vía [Autónomos y Emprendedor](https://www.autonomosyemprendedor.es/articulo/pymes/pymes-solo-cobran-cada-tres-facturas-tiempo-ultimo-observatorio-morosidad/20260410165245053056.html)).
  **Para Uruguay no hay dato verificable**: por eso el primer paso son las entrevistas.
- **Hay quien paga por resolverlo, pero barato:** [Saldea](https://www.marsof.es/saldea) cuesta 49 a 99 €
  al mes y [Chaser](https://www.chaserhq.com/pricing) desde 199 £ al mes. Lo que un freelance
  vende no es «otro recordatorio», sino la **implantación** en pymes que no adoptan software por
  falta de tiempo o de integración.
- **Retorno fácil de explicar:** por cada 10 días menos de cobro, una empresa que factura 500.000 al
  año libera unos 13.700 de circulante (500.000 × 10 ÷ 365). Es un cálculo de ejemplo, no un dato medido.
- **Riesgo controlable:** toca datos financieros de terceros, por eso la v1 es de solo lectura,
  con aprobación humana y con la privacidad diseñada desde el principio.

## Documentos

| Documento | Para qué |
|---|---|
| [`docs/01-plan-validacion.md`](docs/01-plan-validacion.md) | Plan de entrevistas: hipótesis, a quién, cómo llegar, guion, escalera de compromiso, reglas de decisión fijadas de antemano y borradores de invitación (**no enviados**). |
| [`docs/02-criterios-lista-objetivo.md`](docs/02-criterios-lista-objetivo.md) | Cómo armar la lista de empresas de Uruguay: perfil, fuentes permitidas y prohibidas, la regla de **no inventar correos**, protocolo de primer contacto, bases de datos y derechos. |
| [`docs/03-arquitectura-n8n.md`](docs/03-arquitectura-n8n.md) | Arquitectura modular en n8n: alcance, módulos, contratos, seguridad y privacidad por diseño, infraestructura, pruebas, etapas, riesgos y decisiones abiertas. |
| [`plantillas/`](plantillas/) | Plantillas **vacías**: notas de entrevista, registro de hipótesis y lista objetivo. |

## Reglas que no se rompen

1. **Solo lectura** sobre los sistemas del cliente; la aprobación final es siempre humana.
2. **Nada se envía a nadie** sin tu autorización explícita. No se toca producción.
3. **No se inventan direcciones de correo**: todo canal tiene fuente y fecha.
4. **La lista real, las notas de entrevistas y cualquier dato personal no van al repositorio**
   (el `.gitignore` bloquea `datos-reales/`, `*.real.*` y `*-real.*`).
5. **Sin perfilado** de deudores ni uso de datos de un cliente para otro fin.
6. **Falla cerrada**: ante la duda, se aparta la fila y se avisa; no se adivina.
7. **No se usa Make**: todo en tu n8n.
8. **La unipersonal se constituye** (BPS/DGI) cuando un cliente confirme interés real y antes de tocar
   sus sistemas o facturar; no antes.

## Puntos de control

| # | Punto | Estado |
|---|---|---|
| 1 | Tras la investigación de nichos | Hecho: nicho 1 elegido, Uruguay, RecordaCitas archivado. |
| 2 | **Tras el diseño** | **En revisión** (estos documentos). Decisiones pendientes en la [sección 16 del documento 03](docs/03-arquitectura-n8n.md#16-decisiones-abiertas). |
| 3 | Tras el desarrollo | Pendiente. Incluirá la guía de verificación manual para no técnicos. |
| 4 | Antes del envío final | Pendiente. |

**Plan B:** presupuestos y seguimiento en oficios (nicho 3), si las entrevistas muestran reticencia a
compartir la «foto de facturación». Antes, la variante local del
[documento 03, sección 12](docs/03-arquitectura-n8n.md#12-variante-los-datos-no-salen-de-la-empresa-modo-local).

## Biblioteca técnica

RecordaCitas quedó **archivado como biblioteca, no como producto**:
[`../biblioteca-tecnica/`](../biblioteca-tecnica/). Sus piezas probadas (lectura de CSV, fechas,
teléfonos de Uruguay, plantillas, enlaces de WhatsApp y método de pruebas) se reutilizan aquí.
