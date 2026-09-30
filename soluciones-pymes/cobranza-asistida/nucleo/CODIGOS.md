# Catálogo de códigos

Todo lo que el núcleo dice sobre un problema es un **código** (`E_…` error, `A_…` aviso). Nunca lleva el
valor que lo causó: ni un nombre, ni un importe, ni una dirección. Así una alerta, una fila del libro o un
registro pueden guardarse y enviarse sin riesgo de filtrar datos del cliente.

Una prueba (`tests/guardarrailes.test.js`) exige que **todo código que aparece en el código fuente esté en
este catálogo** y que todo código de este catálogo exista en el código fuente o esté marcado como emitido
por el shell. Si agregas un código, agrégalo aquí.

**Quién lo ve.** «Dueño» = quien recibe el informe (aparece con una frase fija, sin datos). «Javier» = quien
opera el sistema (recibe el código en la alerta). «Fila» = se cuenta en «filas del archivo que no se pudieron leer».

## 1. Filas del archivo que no se pudieron leer (se apartan; el resto sigue)

| Código | Qué pasó | Qué hacer |
|---|---|---|
| `E_REF_VACIA` | La fila no tiene número de factura. | El dueño la corrige en su sistema. |
| `E_REF_INVALIDA` | Número de factura con caracteres no admitidos o demasiado largo. | Ídem. |
| `E_DEUDOR_VACIO` | La fila no tiene nombre de cliente. | Ídem. |
| `E_IMPORTE_INVALIDO` | Importe ilegible, con formato dudoso (`1,234.50` en un archivo con coma decimal) o fuera de rango. | Revisar el formato numérico configurado (`formato_importe`). |
| `E_IMPORTE_NO_POSITIVO` | Importe cero o negativo (¿nota de crédito?). | Es lo esperado con notas de crédito; no se reclaman. |
| `E_MONEDA_DESCONOCIDA` | Moneda ausente o no admitida (solo `UYU` y `USD`), o importe con texto no numérico. | Revisar la columna de moneda o `moneda_por_defecto`. |
| `E_MONEDA_CONFLICTO` | La moneda de la columna no coincide con la del símbolo del importe. | Corregir en el sistema de origen. |
| `E_FECHA_VACIA` | Sin fecha de vencimiento. | Ídem. |
| `E_FECHA_INVALIDA` | La fecha no existe (`31/02/2026`) o no se entiende. | Ídem. |
| `E_FECHA_AMBIGUA` | Día y mes posiblemente invertidos (`09/30/2026`), o instante con hora y desfase sin zona configurada. | Ídem; comprobar `zona_horaria`. |
| `E_FECHA_FUERA_DE_RANGO` | Vencimiento más de 5 años atrás o más de 2 adelante. | Ídem (suele ser un error de tipeo). |
| `E_CELDA_LARGA` | Un texto de la fila excede el largo máximo (300). | Ídem. |
| `E_FILA_DESALINEADA` | La fila tiene más celdas que títulos (un separador dentro de un texto sin comillas). | Exportar de nuevo entrecomillando textos. |
| `E_FILA_INVALIDA` | La fila no es una lista de celdas (solo con filas extraídas de una hoja de cálculo). | Revisar la extracción de la hoja. |
| `E_DUPLICADA` | La misma factura y moneda, idéntica, repetida. | Se conserva la primera. |
| `E_CONFLICTO_FACTURA` | La misma factura y moneda con datos distintos: no se sabe cuál vale. | Se apartan todas; el dueño decide. |

## 2. Archivo completo (bloquea el informe: el dueño recibe un aviso de incidencia)

| Código | Qué pasó | Qué hacer |
|---|---|---|
| `E_COLUMNA_FALTANTE` | Falta una columna obligatoria (`factura`, `deudor`, `importe`, `vencimiento`) con el título configurado. | El sistema del cliente cambió el título; actualizar `mapeo_columnas`. |
| `E_COLUMNA_DUPLICADA` | Dos columnas coinciden con el mismo campo. | Revisar el mapeo o el archivo. |
| `E_CSV_VACIO` | El archivo no tiene contenido útil. | Pedir una nueva exportación. |
| `E_CSV_COMILLAS` | Comillas sin cerrar: el resto del archivo quedaría dentro de un campo. | Nueva exportación. |
| `E_ARCHIVO_VACIO` | Sin filas de datos. | Nueva exportación. |
| `E_ARCHIVO_GRANDE` | Más de 6 000 000 de caracteres. | Revisar el filtro de la exportación. |
| `E_DEMASIADAS_FILAS` | Más filas que `limites.max_filas` (5000 por defecto). | Revisar el filtro o subir el límite con criterio. |
| `E_DEMASIADAS_APARTADAS` | Más filas ilegibles que `umbral_rechazo`: un informe con tantas filas de menos engañaría. | Revisar el formato del archivo. |
| `E_FILAS_INVALIDAS` | Las filas de la hoja de cálculo no llegaron como lista. | Revisar el nodo de extracción. |

## 3. Avisos (la fila se acepta; el aviso figura en el informe)

| Código | Qué pasó |
|---|---|
| `A_TEL_INVALIDO` | Teléfono ilegible: la factura entra, sin enlace de WhatsApp. |
| `A_TEL_FIJO` | Teléfono fijo: WhatsApp necesita un móvil. |
| `A_TEL_VACIO` | Teléfono vacío. |
| `A_TEL_EJEMPLO` | Número de ejemplo (datos ficticios): no genera enlace. |
| `A_MAIL_INVALIDO` | Correo ilegible: sin enlace de correo. |
| `A_DISPUTA_NO_ENTENDIDA` | La marca de disputa no se entiende: por prudencia se trata como «en disputa». |
| `A_EMISION_INVALIDA` | Fecha de emisión ilegible (no impide reclamar). |
| `A_VENCIMIENTO_ANTERIOR_EMISION` | El vencimiento es anterior a la emisión. |
| `A_ENLACE_WA_OMITIDO` | El enlace de WhatsApp quedaría demasiado largo o inválido: se omite. |
| `A_ENLACE_MAIL_OMITIDO` | Ídem para el enlace de correo. |

## 4. Configuración (Javier corrige; el sistema no arranca y no toca datos)

| Código | Qué pasó |
|---|---|
| `E_CFG_INVALIDA` | El arranque se detuvo porque la configuración del cliente tiene problemas; la alerta trae, además, la lista de códigos a corregir. |
| `E_CFG_CLIENTE` | La configuración no es un objeto. |
| `E_CFG_CLIENTE_ID` | `cliente_id` vacío, con símbolos o de más de 40 caracteres. |
| `E_CFG_DESTINATARIOS_TAMANO` | La lista blanca no tiene entre 1 y 3 direcciones. |
| `E_CFG_DESTINATARIOS_INVALIDOS` | Una dirección de la lista blanca no está en forma canónica, está repetida o no es válida. |
| `E_CFG_REMITENTE_PRUEBA` | La bandeja de pruebas no es una dirección canónica. |
| `E_CFG_ENTREGA` | `entrega` no es `correo_completo` ni `enlace_salida`. |
| `E_CFG_MODO` | `modo` no es `dry_run` ni `real`. |
| `E_CFG_ENTREGA_REAL` | Modo real con informe completo por correo sin `acepta_correo_completo: true`. |
| `E_CFG_ZONA` | Zona horaria inexistente o mal escrita. |
| `E_CFG_EMPRESA` | Falta el nombre de la empresa o excede 120 caracteres (o los textos de medios de pago o firma son demasiado largos). |
| `E_CFG_UMBRAL` | `umbral_rechazo` fuera de 0–100. |
| `E_CFG_MAPEO` | Mapeo de columnas incompleto, con un campo desconocido o con una columna con dos significados. |
| `E_CFG_FORMATO` | `formato_importe` incoherente (decimal igual a miles, valores no admitidos). |
| `E_CFG_MONEDAS` | Monedas fuera de `UYU` y `USD`, o `moneda_por_defecto` no admitida. |
| `E_CFG_LIMITES` | Límites de filas o de largo de celda fuera de rango. |
| `E_CFG_FECHA_CORTE` | Fecha de corte o rango de vencimientos inválidos. |
| `E_CFG_TRAMOS` | Tramos no contiguos, que no empiezan en 1 o sin el último abierto. |
| `E_CFG_ESCALONES` | Escalones no contiguos, con nombres repetidos o reservados. |
| `E_CFG_INGESTA` | La configuración de ingesta no es un objeto. |
| `E_CFG_PATRON` | Patrón de nombre de archivo vacío, de más de 60 caracteres, con más de 3 comodines o con barras. |
| `E_CFG_ANTIGUEDAD` | `antiguedad_maxima_archivo_dias` fuera de 1–31. |
| `E_CFG_TAMANO` | `tamano_maximo_bytes` fuera de 1024–6 000 000. |
| `E_CFG_DIA_AVISO` | Día del aviso de «no llegó» fuera de 1–7. |

## 5. Plantillas de mensaje (una plantilla rota bloquea TODOS los borradores)

| Código | Qué pasó |
|---|---|
| `E_PLANTILLA_VACIA` | Asunto o cuerpo vacío. |
| `E_PLANTILLA_LARGA` | Más de 2000 caracteres. |
| `E_PLANTILLA_CAMPO_DESCONOCIDO` | Usa un `{campo}` que no existe (o una plantilla con un nombre inválido). |
| `E_PLANTILLA_LLAVES` | Llaves sueltas o sin cerrar. |
| `E_PLANTILLA_FRASE_PROHIBIDA` | Amenaza, consecuencia legal, informe comercial u otro texto vetado por la política de tono. |
| `E_PLANTILLA_SIN_DATOS_CLAVE` | El cuerpo no incluye la factura, el importe y el vencimiento. |
| `E_PLANTILLA_FALTANTE` | Hay un escalón sin plantilla. |
| `E_BORRADOR_SIN_DATOS_CLAVE` | Un borrador terminó sin la factura, el importe o el vencimiento (defensa en profundidad). |

## 6. Ingesta (qué archivo se procesa)

| Código | Qué pasó |
|---|---|
| `E_ARCHIVO_METADATOS` | El listado de la carpeta trae datos incompletos o raros de un archivo. |
| `E_ARCHIVO_TIPO` | Extensión que no es `.csv`, `.tsv` ni `.xlsx`, o tipo de contenido incoherente. |
| `E_ARCHIVO_NOMBRE` | El nombre no coincide con `patron_nombre_archivo`. |
| `E_ARCHIVO_VIEJO` | Modificado hace más de `antiguedad_maxima_archivo_dias`. |
| `E_ARCHIVO_FUTURO` | Fecha de modificación posterior a la fecha de corte (reloj o zona mal). |
| `E_INGESTA_INVALIDA` | Entrada mal armada para la ingesta. |
| `E_INGESTA_DEMASIADOS` | Más de 500 archivos en la carpeta de entrada. |
| `E_DESCARGA_INCOMPLETA` | Los bytes recibidos no coinciden con los del listado. |
| `E_SIN_ARCHIVO` | Marca del libro: se avisó al dueño de que no llegó la exportación de la semana. |

(`E_ARCHIVO_VACIO` y `E_ARCHIVO_GRANDE` de la sección 2 también se usan aquí para archivos de tamaño cero o sobre el tope.)

## 7. Contratos entre módulos y guardias (un defecto de quien conecta, no del archivo)

| Código | Qué pasó |
|---|---|
| `E_FACTURAS_INVALIDAS` / `E_FACTURA_INVALIDA` | M2 o M3 recibieron facturas que no cumplen el contrato de M1. |
| `E_FECHA_CORTE_INVALIDA` | Fecha de corte que no es `AAAA-MM-DD`. |
| `E_AHORA_INVALIDO` | El instante actual no es un instante UTC válido, o la zona no existe. |
| `E_INFORME_INVALIDO` | Entrada mal armada para el informe. |
| `E_INFORME_INCONSISTENTE` | Un borrador no corresponde a la factura bajo la que iba a mostrarse. |
| `E_ENLACE_INVALIDO` | El enlace al informe no es una dirección de Google Drive válida. |
| `E_LIBRO_INVALIDO` | La fila del libro tiene columnas de más, valores fuera de forma o estado y código incoherentes. |
| `E_BLOQUEO_INVALIDO` | Fila de bloqueo o instante mal formados. |
| `E_DECISION_INVALIDA` | Datos mal formados para decidir si procesar. |
| `E_ALERTA_INVALIDA` | Alerta sin código válido. |
| `E_ARRANQUE_INVALIDO` / `E_PREPARAR_INVALIDO` / `E_ENVIO_INVALIDO` | Entrada mal armada para esa etapa. |
| `E_INCONSISTENCIA_ENSAYO` | Las llaves de ensayo cambiaron entre preparar y enviar, o dos definiciones de «envío real» no coinciden. |
| `E_ENVIO_ENTRADA_INVALIDA` | La guardia de envío recibió algo que no es un pedido. |
| `E_ENVIO_INTERRUPTOR_APAGADO` | La guardia de envío no vio el interruptor general abierto. |
| `E_ENVIO_LISTA_BLANCA_TAMANO` | La lista blanca no tiene entre 1 y el máximo de direcciones. |
| `E_ENVIO_LISTA_BLANCA_INVALIDA` | Una dirección de la lista blanca no es canónica. |
| `E_ENVIO_SOLICITADOS_INVALIDOS` | Los destinatarios pedidos no son una lista de 1 a máximo elementos. |
| `E_ENVIO_DESTINATARIO_BLOQUEADO` | Un destinatario pedido no es válido o no está en la lista blanca: no se envía a NADIE. |
| `E_ENVIO_REMITENTE_PRUEBA_INVALIDO` | En ensayo, la bandeja de pruebas no es válida. |

## 8. Genéricos

| Código | Qué pasó |
|---|---|
| `E_DESBORDE` | Una suma de importes excedería el máximo seguro. |
| `E_DESCONOCIDO` | Un error sin código llegó al saneador. **Es un defecto a investigar**: todo error debe llevar código. |
| `E_INTERNO` | Se intentó lanzar un código mal formado. **Es un defecto a investigar.** |

## 9. Emitidos por el shell (no por el núcleo)

El shell convierte todo fallo de entrada o salida en uno de estos códigos: el mensaje de un servicio externo
puede traer datos del cliente y nunca se reenvía.

| Código | Cuándo |
|---|---|
| `E_DRIVE_LISTAR` | Falló la lectura de la carpeta de entrada (permiso, red, cuota). |
| `E_DRIVE_DESCARGAR` | Falló la descarga del archivo elegido. |
| `E_DRIVE_SUBIR` | Falló la subida del informe a la carpeta de salida. |
| `E_CORREO_ENVIAR` | Falló el envío del correo. |
| `E_ARCHIVO_AMBIGUO` | Dos archivos aptos con el mismo instante más reciente: no se elige a ciegas. |
| `E_BLOQUEO_VENCIDO` | Una ejecución anterior murió sin liberar el bloqueo: se avisa, no se reintenta sola. |
