# Arquitectura

## Vista general

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FUENTES                                                                 │
│  Amazon PA-API 5.0 (ES/DE/IT/FR) · datafeeds Awin/Tradedoubler/Admitad   │
│  RSS de ofertas · páginas con JSON-LD · AliExpress Portals               │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  WF01 · cada 15 min
                                ▼
                    ┌───────────────────────┐
                    │ Normalización + hash  │  esquema común, dedupe SHA-256
                    │ de deduplicación      │  1 muestra/producto/día
                    └───────────┬───────────┘
                                ▼
                    ┌───────────────────────┐
                    │ ofertas (estado=nueva)│◄──── precios_historico
                    └───────────┬───────────┘
                                │  WF02 · cada 5 min
                                ▼
      ┌─────────────────────────────────────────────────┐
      │ 1. Precio real   mediana 90d + mínimo 30d        │
      │ 2. Coste total   precio + envío + import − cupón │
      │ 3. Filtros duros descuento<15%, sin programa…    │
      │ 4. IA (Claude)   categoría, copy, riesgos        │
      │ 5. Score 0-100   auditable en score_detalle      │
      │ 6. Deeplink      red + SubID de atribución       │
      └───────────────────────┬─────────────────────────┘
                              ▼  estado = clasificada
                    ┌───────────────────────┐
                    │  WF03 · cada 10 min   │
                    │  control de ruido     │
                    └─────┬───────────┬─────┘
                          ▼           ▼
                  Canal Telegram   Avisos privados
                  (general/temático) (alertas casadas)
                          │
                          ▼  el usuario pulsa "🛒 Ver oferta"
                    ┌───────────────────────┐
                    │ WF06 · /webhook/r/:id │  registra clic + SubID → 302
                    └───────────┬───────────┘
                                ▼
                      red de afiliación → tienda → compra
                                │
                                ▼  POST /webhook/postback/:red
                    ┌───────────────────────┐
                    │ conversiones · EPC    │──► informe diario (WF05)
                    └───────────────────────┘

   WF04 · bot conversacional: /alerta /top /buscar /misalertas /historial…
   WF05 · cada hora: verifica vigencia y marca caducadas editando el mensaje
```

## Los seis workflows

| # | Fichero | Disparador | Qué hace |
|---|---|---|---|
| 01 | `01-ingesta-ofertas.json` | cada 15 min | Recolecta de 4 tipos de fuente, normaliza, deduplica y guarda muestra de precio |
| 02 | `02-clasificacion-scoring.json` | cada 5 min + llamada | Verifica el precio real, clasifica con IA, puntúa y monetiza el enlace |
| 03 | `03-publicacion-telegram.json` | cada 10 min | Publica en el canal con control de ruido y dispara los avisos privados |
| 04 | `04-bot-telegram.json` | webhook de Telegram | Bot conversacional: alertas, búsqueda, top, histórico de precio |
| 05 | `05-vigencia-e-informes.json` | cada hora + 08:00 | Marca caducadas editando el mensaje publicado; informe diario de negocio |
| 06 | `06-redirector-y-postback.json` | webhooks HTTP | Redirector de clics con SubID y recepción de conversiones |

## Máquina de estados de una oferta

```
      ingesta                clasificación             publicación
   ─────────────►  nueva  ──────────────►  clasificada ────────────►  publicada
                     │                          │                        │
                     │  filtros duros           │  IA: publicable=false  │ verificación
                     ▼                          ▼                        ▼ horaria
                 descartada  ◄──────────────────┘                    caducada
                     ▲
                     │  una bajada ≥3% sobre el precio ya tratado
                     └──────────  devuelve la oferta a «nueva» ────────────┘
```

Ese último arco es importante: un producto ya publicado que vuelve a bajar se reevalúa y
puede volver a publicarse, en vez de quedar congelado por la deduplicación.

## Decisiones de diseño

**PostgreSQL como estado, no la memoria de n8n.** Los datos estáticos de n8n
(`staticData`) no soportan concurrencia ni consultas. El histórico de precios —el activo
principal del sistema— necesita agregaciones (mediana, percentiles, ventanas temporales) que
solo tienen sentido en SQL.

**Un solo `INSERT` por lote de ingesta.** El nodo «Guardar ofertas e histórico» recibe todo
el lote como un JSON y lo inserta con `jsonb_to_recordset` + `ON CONFLICT`, escribiendo a la
vez en `ofertas` y `precios_historico` mediante CTEs. Una sola ida y vuelta, atómica, en vez
de N consultas. El truco `(xmax = 0) AS es_nueva` distingue altas de actualizaciones.

**Llamadas HTTP a la Bot API en vez del nodo Telegram para publicar.** El nodo nativo no
expone `reply_markup` con la flexibilidad necesaria para teclados dinámicos ni
`editMessageCaption` sobre mensajes antiguos. El bot sí usa el nodo `telegramTrigger`, que
gestiona el registro del webhook automáticamente.

**La IA no es un punto único de fallo.** Si la llamada a Claude falla o devuelve algo
inesperado, `Score, enlace afiliado y copy` cae en valores por defecto y el sistema sigue
funcionando solo con reglas, añadiendo el riesgo `clasificacion_ia_no_disponible`. Un fallo
de la API no detiene el canal.

**Ventanas de tiempo en SQL, no en JavaScript.** El control de ruido (tope horario, 2 por
categoría, 20 minutos por comercio) se resuelve en la propia consulta de selección con
funciones de ventana. Así el límite se respeta aunque haya varias ejecuciones solapadas.

**Firma SigV4 a mano.** No existe nodo nativo de PA-API 5.0, así que la firma AWS Signature
V4 se hace en un nodo Code con `crypto`. Requiere `NODE_FUNCTION_ALLOW_BUILTIN=crypto` en el
entorno de n8n; sin esa variable la rama de Amazon falla y el resto sigue funcionando.

**Solo datos estructurados en el scraping.** La rama HTML lee exclusivamente bloques
`application/ld+json` (`schema.org/Product`), que las tiendas publican para los buscadores.
No se parsea el DOM, no se rota el user-agent ni se evita ninguna protección. Si una tienda
no expone JSON-LD, esa fuente simplemente no produce ofertas.

## Rendimiento y escala

Con la configuración por defecto:

| Magnitud | Valor |
|---|---|
| Ofertas captadas | ~500–2 000/día según fuentes activas |
| Llamadas a la IA | ~1 por oferta que supera los filtros duros (≈10–20 % del total) |
| Ofertas publicadas | 12/hora como máximo, típicamente 15–40/día |
| Crecimiento de `precios_historico` | ~1 fila por producto seguido y día |
| Ejecuciones de n8n | ~150/día |

Cuellos de botella por orden de aparición:

1. **Coste de la IA.** Es el gasto variable dominante. Se controla con los filtros duros
   *antes* de la llamada y con el agrupamiento de peticiones (5 concurrentes). Para
   volúmenes altos, una primera criba con reglas o un modelo más pequeño reduce el gasto.
2. **Cuotas de PA-API.** Amazon limita por TPS y las amplía según las ventas generadas. Una
   cuenta nueva tiene poco margen: conviene espaciar las fuentes.
3. **Límites de la Bot API.** ~30 mensajes/segundo globales y ~20/minuto al mismo canal. La
   espera de 3 s del bucle y el tope horario dejan mucho margen; el fan-out de alertas es lo
   que puede acercarse al límite si hay miles de suscriptores. Con >5 000 suscriptores
   conviene trocear el envío en lotes con espera.
4. **`precios_historico`.** Crece linealmente. El índice único por día lo contiene y el WF05
   purga a los 400 días.
