# Biblioteca técnica

Código probado que **no se ofrece como producto**. Sirve de banco de pruebas y de fuente de piezas
para las herramientas que sí se ofrecen.

| Elemento | Estado | Para qué sirve |
|---|---|---|
| [`recordacitas/`](recordacitas/) | **Archivado** (29-sep-2026) | Recordatorios de cita por WhatsApp. El nicho está saturado y se descartó como oferta. Se conserva su código y sus pruebas. |

## Qué se reutiliza de RecordaCitas

| Pieza | Dónde está |
|---|---|
| Lectura de CSV y TSV con detección de separador; decodificación Windows-1252, UTF-16 y BOM | `recordacitas.html`, bloque `<script id="core">` |
| Fechas día-primero que rechazan lo ambiguo; aritmética en UTC | ídem |
| Teléfonos de España y Uruguay | ídem |
| Plantillas: omisión solo de líneas totalmente vacías, bloqueo de llaves rotas | ídem |
| Enlaces `api.whatsapp.com/send` (comprobado contra el servicio real que `wa.me` corrompe emojis) | ídem |
| Método de pruebas: propiedades, seis zonas horarias, mutaciones, garantías estáticas, navegador real | `recordacitas/tests/` y `recordacitas/verificar.sh` |

El uso previsto está descrito en el [documento de arquitectura de cobranza asistida, sección 14](../cobranza-asistida/docs/03-arquitectura-n8n.md#14-reutilización-de-la-biblioteca-técnica-recordacitas).

## Reglas

- **No se muestra a clientes** ni se presenta como producto.
- **Sigue verificándose:** `cd recordacitas && ./verificar.sh` (Node 20 o superior; el paso de
  navegador se omite si falta Playwright).
- Solo se modifica si la mejora sirve de base a otra herramienta, y siempre con `./verificar.sh` en verde.
- Al reutilizar una pieza, se **copia con su prueba**; no se enlaza a medias.
