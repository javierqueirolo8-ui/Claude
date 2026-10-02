# Referencia del núcleo

**Generada a partir del código** con `node doc/generar-referencia.js`: no se edita a mano. Una prueba (`tests/documentacion.test.js`)
falla si no coincide con `src/`. La explicación de cómo está pensado el código y cómo modificarlo está en [`GUIA-DEL-CODIGO.md`](GUIA-DEL-CODIGO.md).

Cada módulo es un archivo de `src/` que define **una** variable global (por ejemplo `M2`) con sus funciones públicas. Los módulos se
cargan en este orden (cada uno puede usar a los anteriores), que es también el orden del paquete que corre en n8n.

| Módulo | Archivo | Líneas | Funciones públicas | Constantes | Usa |
|---|---|---|---|---|---|
| [`Util`](#util) | `src/util.js` | 417 | 32 | 3 | — |
| [`M0`](#m0) | `src/m0-guardias.js` | 69 | 2 | 3 | Util |
| [`M1`](#m1) | `src/m1-normalizar.js` | 443 | 5 | 5 | Util |
| [`M2`](#m2) | `src/m2-antiguedad.js` | 137 | 3 | 3 | Util |
| [`M3`](#m3) | `src/m3-borradores.js` | 258 | 6 | 5 | Util |
| [`M4`](#m4) | `src/m4-informe.js` | 376 | 4 | 3 | Util |
| [`M5`](#m5) | `src/m5-guardia-envio.js` | 65 | 2 | 1 | Util |
| [`M6`](#m6) | `src/m6-registro.js` | 182 | 9 | 4 | Util |
| [`M7`](#m7) | `src/m7-ingesta.js` | 173 | 6 | 6 | Util |
| [`Cobranza`](#cobranza) | `src/pipeline.js` | 326 | 14 | 0 | Util, M0, M1, M2, M3, M4, M5, M6, M7 |
| [`Envoltorio`](#envoltorio) | `src/envoltorio.js` | 45 | 1 | 1 | Util, Cobranza |

**Funciones públicas sin comentario propio en el código** (25 de 84): `Util.limpiar`, `Util.sinAcentos`, `Util.escHtml`, `Util.pad2`, `Util.sumarSeguro`, `Util.isoDe`, `Util.partesISO`, `Util.esISO`, `Util.fechaValida`, `Util.sumarDias`, `Util.formatearNumero`, `Util.agruparMiles`, `Util.normalizarCorreo`, `Util.normalizarTelefono`, `Util.esNumeroDeEjemplo`, `Util.idValido`, `Util.hex64`, `M0.validarConfigCliente`, `M2.validarEscalones`, `M3.validarEmpresa`, `M6.sanearError`, `M6.textoAlerta`, `M6.claveEjecucion`, `M6.filaLibro`, `M7.validarConfig`. Se documentan aquí por su firma y sus códigos; conviene agregarles un comentario en el próximo cambio funcional de ese módulo.

---

<a id="util"></a>
## Util · `src/util.js`

```text
Util: utilidades puras y compartidas del núcleo de cobranza asistida.

· Sin DOM, sin red, sin reloj, sin azar, sin archivos, sin variables de entorno.
· Se antepone a cada módulo dentro de su nodo de código de n8n (ver ../README.md).
· Regla de oro: un error lleva un CÓDIGO (E_...) y NUNCA el valor que lo causó.
  Así ningún dato del archivo del cliente puede acabar en un registro o en una alerta.
```

**Usa:** nada (es la base) · **Líneas:** 417

### Funciones públicas

#### `Util.fallar(codigo)`

```text
Lanza un error cuyo mensaje es SOLO el código. Solo se llama con literales E_....
```

_Definida en la línea 17._

#### `Util.codigoDe(error)`

```text
Código seguro de cualquier error capturado (nunca su mensaje libre).
```

_Definida en la línea 25._

#### `Util.texto(v)`

```text
Solo texto y números; objetos, listas o fechas de JavaScript se ignoran (evita «[object Object]»
y la conversión de Date a texto, que depende de la zona horaria).
```

_Definida en la línea 49._

#### `Util.limpiar(v)`

_Sin comentario en el código._

_Definida en la línea 56._

#### `Util.sinAcentos(s)`

_Sin comentario en el código._

_Definida en la línea 62._

#### `Util.clave(s)`

```text
Clave para comparar títulos de columna sin distinguir mayúsculas, tildes ni signos.
```

_Definida en la línea 65._

#### `Util.escHtml(s)`

_Sin comentario en el código._

_Definida en la línea 67._

#### `Util.pad2(n)`

_Sin comentario en el código._

_Definida en la línea 72._

#### `Util.sumarSeguro(a, b)`

_Sin comentario en el código._

_Definida en la línea 79._ Códigos que usa directamente: lanza `E_DESBORDE`.

#### `Util.contarPorCodigo(lista)`

```text
[{codigo: 'E_X'}, ...] → { E_X: n }
```

_Definida en la línea 86._

#### `Util.isoDe(y, m, d)`

_Sin comentario en el código._

_Definida en la línea 99._

#### `Util.partesISO(iso)`

_Sin comentario en el código._

_Definida en la línea 107._

#### `Util.esISO(iso)`

_Sin comentario en el código._

_Definida en la línea 114._

#### `Util.fechaValida(y, m, d)`

_Sin comentario en el código._

_Definida en la línea 101._

#### `Util.sumarDias(iso, n)`

_Sin comentario en el código._

_Definida en la línea 116._ Códigos que usa directamente: lanza `E_FECHA_INVALIDA`.

#### `Util.diasEntre(a, b)`

```text
Días de calendario de a a b (positivo si b es posterior a a).
```

_Definida en la línea 124._ Códigos que usa directamente: lanza `E_FECHA_INVALIDA`.

#### `Util.semanaISO(iso)`

```text
Semana ISO 8601 («2026-W40»). La semana pertenece al año de su jueves.
```

_Definida en la línea 131._ Códigos que usa directamente: lanza `E_FECHA_INVALIDA`.

#### `Util.formatoFecha(iso)`

```text
«05/10/2026»
```

_Definida en la línea 144._ Códigos que usa directamente: lanza `E_FECHA_INVALIDA`.

#### `Util.parsearFecha(raw, opc)`

```text
Formatos aceptados (siempre día primero; lo que no se puede leer con certeza se rechaza):
  30/09/2026 · 30-9-26 · 30.09.2026 · 2026-09-30 · 30 sep 2026 · 30 de septiembre de 2026
  2026-09-30T00:00:00Z · «30/09/2026 0:00:00» · número de serie de Excel (solo si es un número)
opc.zona: zona IANA para convertir instantes con desfase que no caen en medianoche.
Devuelve { ok:true, iso } o { ok:false, codigo }.
```

_Definida en la línea 202._

#### `Util.desdeSerialExcel(n)`

```text
Número de serie de Excel (sistema 1900). Solo se acepta un NÚMERO real, nunca un texto de cifras:
un número de factura en la columna de fechas no debe convertirse en una fecha sin avisar.
```

_Definida en la línea 164._

#### `Util.fechaEnZona(instanteISO, zona)`

```text
Fecha local en una zona IANA de un instante (texto ISO con desfase). Determinista: Intl con zona explícita.
Devuelve null si el instante o la zona no son válidos.
```

_Definida en la línea 177._

#### `Util.parsearImporte(raw, fmt)`

```text
raw: texto o número. fmt: { decimal: ',' | '.', miles: '.' | ',' | ' ' | '' } (por defecto Uruguay: , y .).
Reconoce un símbolo de moneda pegado al importe («$U 85.000,00», «U$S 3.150», «85.000 $»).
Devuelve { ok:true, centavos, moneda } (moneda null si no había símbolo) o { ok:false, codigo }.
```

_Definida en la línea 290._

#### `Util.monedaDeTexto(raw)`

```text
Texto de una columna «moneda» → 'UYU' | 'USD' | null (desconocida).
```

_Definida en la línea 259._

#### `Util.formatearImporte(centavos, moneda)`

```text
8500000, 'UYU' → «$U 85.000»; 8500050 → «$U 85.000,50»
```

_Definida en la línea 331._ Códigos que usa directamente: lanza `E_IMPORTE_INVALIDO`, `E_MONEDA_DESCONOCIDA`.

#### `Util.formatearNumero(n)`

_Sin comentario en el código._

_Definida en la línea 338._

#### `Util.agruparMiles(entero)`

_Sin comentario en el código._

_Definida en la línea 324._

#### `Util.normalizarCorreo(raw)`

_Sin comentario en el código._

_Definida en la línea 347._

#### `Util.normalizarTelefono(raw)`

_Sin comentario en el código._

_Definida en la línea 366._

#### `Util.esNumeroDeEjemplo(digitos)`

_Sin comentario en el código._

_Definida en la línea 364._

#### `Util.refValida(s)`

```text
Número de factura ya normalizado (lo que produce M1): mayúsculas, dígitos y . / _ - con espacios sueltos, hasta 40.
Es lo único que M2 y M3 aceptan; una referencia con saltos de línea o controles jamás llega a un mensaje.
```

_Definida en la línea 398._

#### `Util.idValido(s)`

_Sin comentario en el código._

_Definida en la línea 402._

#### `Util.hex64(s)`

_Sin comentario en el código._

_Definida en la línea 403._

### Constantes públicas

- `Util.MAX_SEGURO` = `9007199254740991` — Number.MAX_SAFE_INTEGER
- `Util.LIMITE_CENTAVOS` = `10000000000000` — 1e13 centavos = 100.000 millones
- `Util.NUMEROS_EJEMPLO` = `['59899000001', '59899000002', '59899000003', '59899000004', '59899000005',`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `A_TEL_INVALIDO` | Teléfono ilegible: la factura entra, sin enlace de WhatsApp. |
| `A_TEL_VACIO` | Teléfono vacío. |
| `E_DESBORDE` | Una suma de importes excedería el máximo seguro. |
| `E_DESCONOCIDO` | Un error sin código llegó al saneador. **Es un defecto a investigar**: todo error debe llevar código. |
| `E_FECHA_AMBIGUA` | Día y mes posiblemente invertidos (`09/30/2026`), o instante con hora y desfase sin zona configurada. |
| `E_FECHA_INVALIDA` | La fecha no existe (`31/02/2026`) o no se entiende. |
| `E_FECHA_VACIA` | Sin fecha de vencimiento. |
| `E_IMPORTE_INVALIDO` | Importe ilegible, con formato dudoso (`1,234.50` en un archivo con coma decimal) o fuera de rango. |
| `E_IMPORTE_NO_POSITIVO` | Importe cero o negativo (¿nota de crédito?). |
| `E_INTERNO` | Se intentó lanzar un código mal formado. **Es un defecto a investigar.** |
| `E_MONEDA_DESCONOCIDA` | Moneda ausente o no admitida (solo `UYU` y `USD`), o importe con texto no numérico. |

---

<a id="m0"></a>
## M0 · `src/m0-guardias.js`

```text
M0 · Guardias globales y validación de la configuración del cliente. Módulo PURO (usa solo Util).

· evaluarGuardias: convierte los valores guardados en la tabla de control (interruptor general y
  DRY_RUN) en dos booleanos. Ante cualquier valor raro, NO se procesa y se ensaya: el valor por
  defecto es siempre el lado seguro.
· validarConfigCliente: revisa la parte general de la configuración de un cliente y devuelve TODOS
  los problemas de una vez (como códigos), para que se corrijan juntos. El flujo no arranca si hay
  alguno. Cada módulo valida además su propio trozo (mapeo de columnas, plantillas, tramos…).
```

**Usa:** `Util` · **Líneas:** 69

### Funciones públicas

#### `M0.evaluarGuardias(fila)`

```text
fila: { interruptor: 'on' | 'off' | true | false, dry_run: 'true' | 'false' | true | false }
```

_Definida en la línea 23._

#### `M0.validarConfigCliente(cfg)`

_Sin comentario en el código._

_Definida en la línea 50._

### Constantes públicas

- `M0.MAX_DESTINATARIOS` = `3`
- `M0.ENTREGAS` = `['correo_completo', 'enlace_salida']`
- `M0.MODOS` = `['dry_run', 'real']`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `E_CFG_CLIENTE` | La configuración no es un objeto. |
| `E_CFG_CLIENTE_ID` | `cliente_id` vacío, con símbolos o de más de 40 caracteres. |
| `E_CFG_DESTINATARIOS_INVALIDOS` | Una dirección de la lista blanca no está en forma canónica, está repetida o no es válida. |
| `E_CFG_DESTINATARIOS_TAMANO` | La lista blanca no tiene entre 1 y 3 direcciones. |
| `E_CFG_EMPRESA` | Falta el nombre de la empresa o excede 120 caracteres (o los textos de medios de pago o firma son demasiado largos). |
| `E_CFG_ENTREGA` | `entrega` no es `correo_completo` ni `enlace_salida`. |
| `E_CFG_ENTREGA_REAL` | Modo real con informe completo por correo sin `acepta_correo_completo: true`. |
| `E_CFG_MODO` | `modo` no es `dry_run` ni `real`. |
| `E_CFG_REMITENTE_PRUEBA` | La bandeja de pruebas no es una dirección canónica. |
| `E_CFG_UMBRAL` | `umbral_rechazo` fuera de 0–100. |
| `E_CFG_ZONA` | Zona horaria inexistente o mal escrita. |

---

<a id="m1"></a>
## M1 · `src/m1-normalizar.js`

```text
M1 · Normalizar tabla. Módulo PURO (usa solo Util, que va antepuesto).

Entrada: la exportación de «facturas pendientes» del cliente, como texto CSV o como filas ya
extraídas por n8n (una lista de objetos {título: valor}). Salida: facturas normalizadas y filas
apartadas con un código. Sin red, sin reloj, sin azar, sin estado.

Principios:
· Falla cerrada: una fila dudosa se aparta con un código, nunca se «arregla» a ojo.
· Los títulos de columna se asignan por configuración, JAMÁS por parecido: leer «Total» en vez de
  «Saldo» reclamaría un importe equivocado.
· Ningún error, aviso ni código lleva el valor del archivo; solo el número de fila.
· aceptadas + apartadas = total, siempre.
```

**Usa:** `Util` · **Líneas:** 443

### Funciones públicas

#### `M1.validarConfig(cfg)`

```text
Devuelve la configuración ya validada y completa. Una configuración mala es un error de quien
configura, no del archivo: se lanza un código E_CFG_* y no se procesa nada.
```

_Definida en la línea 45._ Códigos que usa directamente: lanza `E_CFG_FECHA_CORTE`, `E_CFG_FORMATO`, `E_CFG_LIMITES`, `E_CFG_MAPEO`, `E_CFG_MONEDAS`, `E_CFG_UMBRAL`, `E_CFG_ZONA`.

#### `M1.leerCSV(entrada)`

```text
CSV tolerante (RFC 4180): comillas, comillas dobles, saltos de línea dentro de un campo, \r\n / \n / \r.
Devuelve { cabeceras, filas: [[celdas]], lineas: [n] }. Comillas sin cerrar = archivo rechazado: se
tragarían el resto de filas dentro de un solo campo.
```

_Definida en la línea 128._ Códigos que usa directamente: lanza `E_ARCHIVO_GRANDE`, `E_CSV_COMILLAS`, `E_CSV_VACIO`.

#### `M1.normalizarTabla(tabla, cfgEntrada)`

```text
tabla: { cabeceras: [texto], filas: [[valores]], lineas?: [n] }
```

_Definida en la línea 236._ Códigos que usa directamente: devuelve como resultado `A_DISPUTA_NO_ENTENDIDA`, `A_EMISION_INVALIDA`, `A_MAIL_INVALIDO`, `A_TEL_FIJO`, `A_TEL_INVALIDO`, `A_VENCIMIENTO_ANTERIOR_EMISION`, `E_CELDA_LARGA`, `E_FILA_DESALINEADA`, `E_FILA_INVALIDA`.

#### `M1.normalizarObjetos(filas, cfg)`

```text
Filas ya extraídas por n8n: [{ 'Nro Factura': 'A-1', 'Saldo': '1.000,00', … }, …]
```

_Definida en la línea 410._ Códigos que usa directamente: lanza `E_FILAS_INVALIDAS`.

#### `M1.normalizarCSV(texto, cfg)`

```text
Texto CSV completo (ya decodificado).
```

_Definida en la línea 427._

### Constantes públicas

- `M1.CAMPOS` = `CAMPOS_OBLIGATORIOS.concat(CAMPOS_OPCIONALES)`
- `M1.CAMPOS_OBLIGATORIOS` = `['factura', 'deudor', 'importe', 'vencimiento']`
- `M1.CAMPOS_OPCIONALES` = `['serie', 'moneda', 'emision', 'telefono', 'correo', 'en_disputa']`
- `M1.LIMITES_POR_DEFECTO` = `{ max_filas: 5000, max_largo_celda: 300 }`
- `M1.UMBRAL_POR_DEFECTO` = `5`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `A_DISPUTA_NO_ENTENDIDA` | La marca de disputa no se entiende: por prudencia se trata como «en disputa». |
| `A_EMISION_INVALIDA` | Fecha de emisión ilegible (no impide reclamar). |
| `A_MAIL_INVALIDO` | Correo ilegible: sin enlace de correo. |
| `A_TEL_FIJO` | Teléfono fijo: WhatsApp necesita un móvil. |
| `A_TEL_INVALIDO` | Teléfono ilegible: la factura entra, sin enlace de WhatsApp. |
| `A_VENCIMIENTO_ANTERIOR_EMISION` | El vencimiento es anterior a la emisión. |
| `E_ARCHIVO_GRANDE` | Más de 6 000 000 de caracteres. |
| `E_ARCHIVO_VACIO` | Sin filas de datos. |
| `E_CELDA_LARGA` | Un texto de la fila excede el largo máximo (300). |
| `E_CFG_FECHA_CORTE` | Fecha de corte o rango de vencimientos inválidos. |
| `E_CFG_FORMATO` | `formato_importe` incoherente (decimal igual a miles, valores no admitidos). |
| `E_CFG_LIMITES` | Límites de filas o de largo de celda fuera de rango. |
| `E_CFG_MAPEO` | Mapeo de columnas incompleto, con un campo desconocido o con una columna con dos significados. |
| `E_CFG_MONEDAS` | Monedas fuera de `UYU` y `USD`, o `moneda_por_defecto` no admitida. |
| `E_CFG_UMBRAL` | `umbral_rechazo` fuera de 0–100. |
| `E_CFG_ZONA` | Zona horaria inexistente o mal escrita. |
| `E_COLUMNA_DUPLICADA` | Dos columnas coinciden con el mismo campo. |
| `E_COLUMNA_FALTANTE` | Falta una columna obligatoria (`factura`, `deudor`, `importe`, `vencimiento`) con el título configurado. |
| `E_CONFLICTO_FACTURA` | La misma factura y moneda con datos distintos: no se sabe cuál vale. |
| `E_CSV_COMILLAS` | Comillas sin cerrar: el resto del archivo quedaría dentro de un campo. |
| `E_CSV_VACIO` | El archivo no tiene contenido útil. |
| `E_DEMASIADAS_APARTADAS` | Más filas ilegibles que `umbral_rechazo`: un informe con tantas filas de menos engañaría. |
| `E_DEMASIADAS_FILAS` | Más filas que `limites.max_filas` (5000 por defecto). |
| `E_DEUDOR_VACIO` | La fila no tiene nombre de cliente. |
| `E_DUPLICADA` | La misma factura y moneda, idéntica, repetida. |
| `E_FECHA_FUERA_DE_RANGO` | Vencimiento más de 5 años atrás o más de 2 adelante. |
| `E_FILAS_INVALIDAS` | Las filas de la hoja de cálculo no llegaron como lista. |
| `E_FILA_DESALINEADA` | La fila tiene más celdas que títulos (un separador dentro de un texto sin comillas). |
| `E_FILA_INVALIDA` | La fila no es una lista de celdas (solo con filas extraídas de una hoja de cálculo). |
| `E_MONEDA_CONFLICTO` | La moneda de la columna no coincide con la del símbolo del importe. |
| `E_MONEDA_DESCONOCIDA` | Moneda ausente o no admitida (solo `UYU` y `USD`), o importe con texto no numérico. |
| `E_REF_INVALIDA` | Número de factura con caracteres no admitidos o demasiado largo. |
| `E_REF_VACIA` | La fila no tiene número de factura. |

---

<a id="m2"></a>
## M2 · `src/m2-antiguedad.js`

```text
M2 · Antigüedad de saldos y escalón sugerido. Módulo PURO (usa solo Util).

Entrada: las facturas normalizadas por M1 y la fecha de corte (AAAA-MM-DD) que fija el
flujo UNA vez. Salida: las vencidas con sus días de atraso, totales por moneda y por tramo,
y el escalón sugerido.

Principios:
· El atraso es objetivo: días de calendario entre el vencimiento y la fecha de corte, calculados
  en UTC sobre fechas sin hora. No hay puntaje, ranking de riesgo ni historial del deudor
  (Decreto 64/020 art. 6 exige una evaluación de impacto para el perfilado de solvencia).
· La sugerencia depende SOLO de los días de atraso y de la marca «en disputa» que ponga el cliente.
· Las monedas nunca se mezclan ni se convierten.
· Sin estado: cada informe se calcula solo con la exportación de esa semana.
```

**Usa:** `Util` · **Líneas:** 137

### Funciones públicas

#### `M2.validarTramos(tramos)`

```text
[[1,30],[31,60],…,[91,null]] o [{desde,hasta},…]: contiguos, crecientes, desde 1 y el último abierto.
```

_Definida en la línea 32._ Códigos que usa directamente: lanza `E_CFG_TRAMOS`.

#### `M2.validarEscalones(escalones)`

_Sin comentario en el código._

_Definida en la línea 48._ Códigos que usa directamente: lanza `E_CFG_ESCALONES`.

#### `M2.calcularAntiguedad(entrada)`

```text
entrada: { facturas, fecha_corte, tramos?, escalones? }
```

_Definida en la línea 90._ Códigos que usa directamente: lanza `E_FACTURAS_INVALIDAS`, `E_FECHA_CORTE_INVALIDA`.

### Constantes públicas

- `M2.TRAMOS_POR_DEFECTO` = `[[1, 30], [31, 60], [61, 90], [91, null]]`
- `M2.ESCALONES_POR_DEFECTO` = `[ …`
- `M2.DIAS_NUEVA` = `7` — «nueva esta semana»: venció hace 7 días o menos

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `E_CFG_ESCALONES` | Escalones no contiguos, con nombres repetidos o reservados. |
| `E_CFG_TRAMOS` | Tramos no contiguos, que no empiezan en 1 o sin el último abierto. |
| `E_FACTURAS_INVALIDAS` | M2 o M3 recibieron facturas que no cumplen el contrato de M1. |
| `E_FACTURA_INVALIDA` | M2 o M3 recibieron facturas que no cumplen el contrato de M1. |
| `E_FECHA_CORTE_INVALIDA` | Fecha de corte que no es `AAAA-MM-DD`. |

---

<a id="m3"></a>
## M3 · `src/m3-borradores.js`

```text
M3 · Borradores de mensaje. Módulo PURO (usa solo Util).

Entrada: las facturas vencidas de M2, los datos de la empresa que cobra y, si hace falta, sus
propias plantillas. Salida: por cada factura, un texto listo para revisar y, si hay teléfono móvil
o correo válidos, un enlace que ABRE el WhatsApp o el correo de quien revisa. Este módulo no envía
nada, no tiene red y no conoce ninguna dirección de envío.

Principios:
· Plantillas deterministas (nada de IA): el mismo dato produce siempre el mismo texto.
· Una plantilla rota bloquea TODOS los borradores. Un mensaje con «{factu}» o sin el importe es
  peor que no tener mensaje.
· El tono por defecto es formal en plural. Sin amenazas, sin mencionar informes comerciales,
  acciones legales ni consecuencias: una prueba lo comprueba en cada plantilla.
· La factura, el importe y el vencimiento nunca faltan en un borrador.
· Los enlaces se construyen con datos ya validados y codificados. Los números de ejemplo nunca
  generan enlace.
```

**Usa:** `Util` · **Líneas:** 258

### Funciones públicas

#### `M3.validarPlantillas(propias)`

```text
Mezcla las plantillas del cliente con las de por defecto y las valida todas: una plantilla rota que
hoy no se usa mañana sí se usará, y se detiene ahora.
```

_Definida en la línea 100._ Códigos que usa directamente: lanza `E_PLANTILLA_CAMPO_DESCONOCIDO`, `E_PLANTILLA_VACIA`.

#### `M3.validarEmpresa(e)`

_Sin comentario en el código._

_Definida en la línea 155._ Códigos que usa directamente: lanza `E_CFG_EMPRESA`.

#### `M3.renderizar(plantilla, vars)`

```text
Sustituye {campos}. Una línea se omite solo si faltan TODOS sus datos («{medios_pago}» sin medios de
pago); si falta uno pero hay otros, la línea se conserva y se ordena el hueco. El texto insertado
no se vuelve a analizar: un nombre con «{factura}» dentro no cambia nada.
```

_Definida en la línea 124._

#### `M3.enlaceWhatsApp(digitos, mensaje)`

```text
https://api.whatsapp.com/send?phone=<número internacional sin +>&text=<mensaje codificado>
No se usa wa.me: su redirección sustituye los emojis y cualquier carácter fuera de Windows-1252 por «�»;
api.whatsapp.com, a donde redirige, los conserva.
```

_Definida en la línea 170._

#### `M3.enlaceMail(direccion, asunto, cuerpo)`

```text
mailto:<dirección>?subject=<…>&body=<…>. La dirección debe pasar el patrón estricto SIN cambios: una
dirección con «?», «&», «,» o «%» habría añadido parámetros ocultos (Bcc, cc) al abrir el enlace.
```

_Definida en la línea 179._

#### `M3.generarBorradores(entrada)`

```text
entrada: { vencidas, empresa: {nombre, medios_pago?, firma?}, plantillas?, opciones?: { demo } }
```

_Definida en la línea 209._ Códigos que usa directamente: lanza `E_BORRADOR_SIN_DATOS_CLAVE`, `E_FACTURAS_INVALIDAS`, `E_PLANTILLA_FALTANTE`.

### Constantes públicas

- `M3.CAMPOS` = `['deudor', 'factura', 'importe', 'moneda', 'importe_completo', 'vencimiento', 'dias_atraso',`
- `M3.PLANTILLAS_POR_DEFECTO` = `{ …`
- `M3.PREFIJOS_PROHIBIDOS` = `['suspend', 'suspens', 'embarg', 'demanda', 'demandar', 'judicial', 'abogad', 'juicio', 'protesto',` — Lo que una plantilla NO puede contener (se compara sin tildes y en minúsculas, sobre el texto de la plantilla, no sobre los datos). Un aviso de cobranza amable no amenaza ni menciona consecuencias; si un cliente quiere otra política, es un cambio consciente de la v1, no un descuido en una plantilla. PREFIJOS atrapan las conjugaciones («suspenderemos», «judicialmente»); PALABRAS son exactas para no confundir «mora» con «moral» ni «intereses» con «interesa»; FRASES son expresiones de varias palabras.
- `M3.PALABRAS_PROHIBIDAS` = `['mora', 'interes', 'intereses', 'bcu']`
- `M3.FRASES_PROHIBIDAS` = `['informe comercial', 'informes comerciales', 'central de riesgos', 'lista negra']`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `A_ENLACE_MAIL_OMITIDO` | Ídem para el enlace de correo. |
| `A_ENLACE_WA_OMITIDO` | El enlace de WhatsApp quedaría demasiado largo o inválido: se omite. |
| `A_TEL_EJEMPLO` | Número de ejemplo (datos ficticios): no genera enlace. |
| `A_TEL_FIJO` | Teléfono fijo: WhatsApp necesita un móvil. |
| `E_BORRADOR_SIN_DATOS_CLAVE` | Un borrador terminó sin la factura, el importe o el vencimiento (defensa en profundidad). |
| `E_CFG_EMPRESA` | Falta el nombre de la empresa o excede 120 caracteres (o los textos de medios de pago o firma son demasiado largos). |
| `E_FACTURAS_INVALIDAS` | M2 o M3 recibieron facturas que no cumplen el contrato de M1. |
| `E_FACTURA_INVALIDA` | M2 o M3 recibieron facturas que no cumplen el contrato de M1. |
| `E_PLANTILLA_CAMPO_DESCONOCIDO` | Usa un `{campo}` que no existe (o una plantilla con un nombre inválido). |
| `E_PLANTILLA_FALTANTE` | Hay un escalón sin plantilla. |
| `E_PLANTILLA_FRASE_PROHIBIDA` | Amenaza, consecuencia legal, informe comercial u otro texto vetado por la política de tono. |
| `E_PLANTILLA_LARGA` | Más de 2000 caracteres. |
| `E_PLANTILLA_LLAVES` | Llaves sueltas o sin cerrar. |
| `E_PLANTILLA_SIN_DATOS_CLAVE` | El cuerpo no incluye la factura, el importe y el vencimiento. |
| `E_PLANTILLA_VACIA` | Asunto o cuerpo vacío. |

---

<a id="m4"></a>
## M4 · `src/m4-informe.js`

```text
M4 · Informe. Módulo PURO (usa solo Util).

Entrada: la antigüedad (M2), los borradores (M3) y el resumen de lectura (M1). Salida:
  · html_completo: una página HTML autocontenida (sin scripts, sin red, con política de seguridad
    restrictiva) con el detalle por cliente, los borradores y los botones que abren WhatsApp o el correo;
  · texto_resumen: solo totales y contadores, SIN nombres, referencias, teléfonos ni correos, para poder
    enviarlo por correo con un enlace al informe completo (modo «enlace_salida»);
  · avisos de incidencia («no pudimos leer el archivo», «no llegó el archivo») con texto fijo.

Principios:
· Todo texto que viene del archivo se escapa. Los únicos enlaces posibles son los de WhatsApp y de
  correo que M3 construyó, y se vuelven a validar con un patrón estricto antes de escribirlos.
· Cada borrador se muestra bajo SU factura: si el emparejamiento no cuadra, no hay informe.
· El tono hacia quien recibe el informe es impersonal («revisar cada mensaje antes de enviarlo»).
```

**Usa:** `Util` · **Líneas:** 376

### Funciones públicas

#### `M4.armarInforme(e)`

```text
entrada: { fecha_corte, empresa:{nombre}, antiguedad, borradores, lectura, opciones?:{demo, ensayo, max_filas_informe} }
```

_Definida en la línea 299._

#### `M4.armarCorreoConEnlace(entrada)`

```text
Correo con solo totales y un enlace al informe completo (modo «enlace_salida»).
```

_Definida en la línea 328._ Códigos que usa directamente: lanza `E_ENLACE_INVALIDO`, `E_INFORME_INVALIDO`.

#### `M4.armarAvisoIncidencia(entrada)`

```text
Aviso cuando el archivo no se pudo leer (M1 pidió bloquear): texto fijo + códigos, sin datos del archivo.
```

_Definida en la línea 340._ Códigos que usa directamente: lanza `E_CFG_EMPRESA`, `E_INFORME_INVALIDO`.

#### `M4.armarAvisoSinArchivo(entrada)`

```text
Aviso cuando esta semana no llegó ninguna exportación reciente.
```

_Definida en la línea 359._ Códigos que usa directamente: lanza `E_CFG_EMPRESA`, `E_INFORME_INVALIDO`.

### Constantes públicas

- `M4.MAX_FILAS_POR_DEFECTO` = `300`
- `M4.DESCRIPCION_CODIGO` = `{ …`
- `M4.DESCRIPCION_BLOQUEO` = `{ …`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `A_TEL_EJEMPLO` | Número de ejemplo (datos ficticios): no genera enlace. |
| `A_TEL_FIJO` | Teléfono fijo: WhatsApp necesita un móvil. |
| `E_CFG_EMPRESA` | Falta el nombre de la empresa o excede 120 caracteres (o los textos de medios de pago o firma son demasiado largos). |
| `E_ENLACE_INVALIDO` | El enlace al informe no es una dirección de Google Drive válida. |
| `E_INFORME_INCONSISTENTE` | Un borrador no corresponde a la factura bajo la que iba a mostrarse. |
| `E_INFORME_INVALIDO` | Entrada mal armada para el informe. |

---

<a id="m5"></a>
## M5 · `src/m5-guardia-envio.js`

```text
M5 · Guardia de envío. Módulo PURO (usa solo Util).

Es el ÚNICO paso que decide a quién se puede escribir. El nodo de envío del flujo recibe sus
destinatarios de aquí y de ningún otro lado; jamás de datos del archivo del cliente.

Reglas (todas fallan cerradas):
· Interruptor apagado o desconocido → no se envía.
· La lista blanca (1 a 3 direcciones, ya en forma canónica) la fija quien configura, no el archivo.
· Cada destinatario pedido debe ser una dirección estricta Y estar en la lista blanca. Si UNO no lo
  está, no se envía a NINGUNO: algo aguas arriba está mal y hay que mirarlo.
· Solo hay envío real si el interruptor general permite el modo real (dry_run = false) Y el cliente
  está en modo «real». En cualquier otro caso el mensaje se redirige a la bandeja de pruebas.
· No existen copia (Cc) ni copia oculta (Bcc).
```

**Usa:** `Util` · **Líneas:** 65

### Funciones públicas

#### `M5.esEnvioReal(guardias, modoCliente)`

```text
Llave doble: interruptor general abierto, «sin ensayo» a nivel general Y cliente en modo «real».
Es la única definición de «envío real»; el resto del núcleo la consulta aquí.
```

_Definida en la línea 29._

#### `M5.guardiaEnvio(e)`

```text
entrada: { solicitados, lista_blanca, guardias:{permitido, dry_run}, modo_cliente, remitente_prueba, max_destinatarios? }
```

_Definida en la línea 34._

### Constantes públicas

- `M5.TOPE_ABSOLUTO` = `5`

---

<a id="m6"></a>
## M6 · `src/m6-registro.js`

```text
M6 · Registro, alertas y control de ejecuciones. Módulo PURO (usa solo Util).

Lo que se guarda o se envía a Javier sobre una ejecución no puede contener datos del cliente:
· sanearError: convierte un error en {cliente, workflow, nodo, CÓDIGO, ejecución}; el mensaje libre
  del error se descarta siempre.
· filaLibro: fila del libro de ejecuciones con columnas fijas y valores validados (contadores, huella,
  fechas, códigos). Una columna de más, o un valor con forma de texto libre, es un error.
· claveEjecucion / decidirEjecucion / estadoBloqueo: idempotencia y bloqueo como funciones puras,
  para probarlas a fondo; el flujo solo conecta las tablas de datos.
· bloqueoVigente / yaResuelto / filaBloqueo: del contenido de las tablas (filas) a la decisión, y la
  fila de un bloqueo nuevo; el flujo lee y escribe filas, nunca interpreta su significado.
```

**Usa:** `Util` · **Líneas:** 182

### Funciones públicas

#### `M6.sanearError(error, contexto)`

_Sin comentario en el código._

_Definida en la línea 55._

#### `M6.textoAlerta(sano)`

_Sin comentario en el código._

_Definida en la línea 66._ Códigos que usa directamente: lanza `E_ALERTA_INVALIDA`.

#### `M6.claveEjecucion(clienteId, fechaCorte, huella)`

_Sin comentario en el código._

_Definida en la línea 78._ Códigos que usa directamente: lanza `E_LIBRO_INVALIDO`.

#### `M6.filaLibro(d)`

_Sin comentario en el código._

_Definida en la línea 83._ Códigos que usa directamente: lanza `E_LIBRO_INVALIDO`.

#### `M6.estadoBloqueo(fila, ahora)`

```text
fila: { cliente_id, expira_utc } o null. ahora: instante UTC ISO que pasa el flujo.
```

_Definida en la línea 107._ Códigos que usa directamente: lanza `E_BLOQUEO_INVALIDO`.

#### `M6.decidirEjecucion(e)`

```text
Qué hacer al empezar una ejecución. ya_resuelto: el libro ya tiene, con la misma clave, una fila «ok» o «incidencia».
```

_Definida en la línea 114._ Códigos que usa directamente: lanza `E_DECISION_INVALIDA`.

#### `M6.bloqueoVigente(filas, clienteId)`

```text
filas: lo que devuelve la tabla de bloqueos al filtrar por cliente (normalmente 0 o 1; varias solo por una carrera rara).
Devuelve la de caducidad más lejana (la más restrictiva) o null si no hay ninguna. Una fila ajena o mal formada es un defecto.
```

_Definida en la línea 135._ Códigos que usa directamente: lanza `E_BLOQUEO_INVALIDO`.

#### `M6.yaResuelto(filas, clave)`

```text
filas: lo que devuelve el libro al filtrar por CLIENTE (todas sus ejecuciones). «Resuelto» = hay una fila «ok» o «incidencia»
con ESA clave (una fila «error» u «omitida» no cuenta: así se reintenta; las de otra semana o archivo del mismo cliente
se ignoran). Una fila de OTRO cliente, o sin clave o estado válidos, es un defecto: el filtro del flujo está mal.
```

_Definida en la línea 148._ Códigos que usa directamente: lanza `E_LIBRO_INVALIDO`.

#### `M6.filaBloqueo(e)`

```text
e: { cliente_id, ahora_utc, minutos? } → { cliente_id, expira_utc }. Caduca «minutos» después de «ahora» (30 por defecto, de 1 a 240).
Aritmética entera sobre el texto del instante, sin reloj ni Date: se descartan las milésimas y se prueba contra un oráculo.
```

_Definida en la línea 161._ Códigos que usa directamente: lanza `E_BLOQUEO_INVALIDO`.

### Constantes públicas

- `M6.ESTADOS` = `['ok', 'incidencia', 'error', 'omitida']` — ok: informe preparado y entregado · incidencia: se avisó al dueño de un problema con el archivo (o de que no llegó) error: falló algo y se avisó a Javier · omitida: se decidió no hacer nada
- `M6.MODOS` = `['dry', 'real']`
- `M6.CLAVES_LIBRO` = `['cliente_id', 'semana_iso', 'hash_archivo', 'estado', 'iniciada_utc', 'terminada_utc',`
- `M6.MINUTOS_BLOQUEO` = `30`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `E_ALERTA_INVALIDA` | Alerta sin código válido. |
| `E_BLOQUEO_INVALIDO` | Fila de bloqueo o instante mal formados. |
| `E_DECISION_INVALIDA` | Datos mal formados para decidir si procesar. |
| `E_LIBRO_INVALIDO` | La fila del libro tiene columnas de más, valores fuera de forma o estado y código incoherentes. |

---

<a id="m7"></a>
## M7 · `src/m7-ingesta.js`

```text
M7 · Ingesta: decidir QUÉ archivo se procesa y si hay que avisar de que no llegó. Módulo PURO (usa solo Util).

Entrada: la lista de archivos que devolvió la carpeta de entrada (id, nombre, tipo, tamaño, fecha de
modificación), la fecha de corte y los límites de la configuración. Nunca abre archivos y JAMÁS devuelve
nombres: el nombre de un archivo puede contener el de una persona. Solo devuelve identificador, formato,
tamaño y fechas.

Reglas (todas fallan cerradas: ante la duda, el archivo no se usa):
· Solo formatos .csv, .tsv y .xlsx, con un tipo de contenido coherente con la extensión.
· Tamaño mayor que cero y menor que el tope (el XLSX tiene un tope menor: es un zip y puede expandirse).
· Modificado dentro de los últimos N días (8 por defecto) y no en el futuro; el más reciente gana.
· Si dos archivos aptos comparten el instante más reciente, no se elige ninguno («ambiguo»).
· «No llegó» se avisa una sola vez por semana, a partir del día configurado (miércoles por defecto).
```

**Usa:** `Util` · **Líneas:** 173

### Funciones públicas

#### `M7.validarConfig(cfg)`

_Sin comentario en el código._

_Definida en la línea 42._ Códigos que usa directamente: lanza `E_CFG_ANTIGUEDAD`, `E_CFG_INGESTA`, `E_CFG_PATRON`, `E_CFG_TAMANO`, `E_CFG_ZONA`.

#### `M7.coincide(patron, texto)`

```text
«*» = cualquier tramo, «?» = un carácter. Sin expresiones regulares: el coste es acotado por el largo del nombre.
```

_Definida en la línea 61._

#### `M7.elegirArchivo(e)`

```text
entrada: { archivos: [{id, name, mimeType, size, modifiedTime}], fecha_corte, config: { patron_nombre_archivo?,
          antiguedad_maxima_archivo_dias?, tamano_maximo_bytes?, zona_horaria } }
salida: { estado: 'elegido' | 'sin_archivo' | 'ambiguo', archivo, descartados: [{indice, codigo}], por_codigo, total }
```

_Definida en la línea 116._ Códigos que usa directamente: lanza `E_INGESTA_DEMASIADOS`, `E_INGESTA_INVALIDA`.

#### `M7.verificarDescarga(e)`

```text
Una descarga cortada a mitad daría un informe con facturas de menos sin que nadie lo note.
```

_Definida en la línea 144._ Códigos que usa directamente: lanza `E_INGESTA_INVALIDA`.

#### `M7.diaDeSemanaISO(iso)`

```text
Lunes = 1 … domingo = 7. El 3 de enero de 2000 fue lunes (las fechas admitidas van de 2000 a 2099).
```

_Definida en la línea 153._ Códigos que usa directamente: lanza `E_FECHA_INVALIDA`.

#### `M7.decidirSinArchivo(e)`

```text
entrada: { fecha_corte, dia_aviso?: 1..7, aviso_ya_enviado: boolean } → 'esperar' | 'avisar' | 'omitir_ya_avisado'
```

_Definida en la línea 159._ Códigos que usa directamente: lanza `E_CFG_DIA_AVISO`, `E_INGESTA_INVALIDA`.

### Constantes públicas

- `M7.HUELLA_SIN_ARCHIVO` = `new Array(65).join('0')` — 64 ceros: «no hay archivo» en la clave del libro
- `M7.MAX_BYTES_DEFECTO` = `5000000`
- `M7.MAX_BYTES_XLSX` = `2000000`
- `M7.ANTIGUEDAD_DEFECTO` = `8`
- `M7.DIA_AVISO_DEFECTO` = `3` — miércoles (ISO: lunes = 1 … domingo = 7)
- `M7.MAX_ARCHIVOS_LISTADOS` = `500`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `E_ARCHIVO_FUTURO` | Fecha de modificación posterior a la fecha de corte (reloj o zona mal). |
| `E_ARCHIVO_GRANDE` | Más de 6 000 000 de caracteres. |
| `E_ARCHIVO_METADATOS` | El listado de la carpeta trae datos incompletos o raros de un archivo. |
| `E_ARCHIVO_NOMBRE` | El nombre no coincide con `patron_nombre_archivo`. |
| `E_ARCHIVO_TIPO` | Extensión que no es `.csv`, `.tsv` ni `.xlsx`, o tipo de contenido incoherente. |
| `E_ARCHIVO_VACIO` | Sin filas de datos. |
| `E_ARCHIVO_VIEJO` | Modificado hace más de `antiguedad_maxima_archivo_dias`. |
| `E_CFG_ANTIGUEDAD` | `antiguedad_maxima_archivo_dias` fuera de 1–31. |
| `E_CFG_DIA_AVISO` | Día del aviso de «no llegó» fuera de 1–7. |
| `E_CFG_INGESTA` | La configuración de ingesta no es un objeto. |
| `E_CFG_PATRON` | Patrón de nombre de archivo vacío, de más de 60 caracteres, con más de 3 comodines o con barras. |
| `E_CFG_TAMANO` | `tamano_maximo_bytes` fuera de 1024–6 000 000. |
| `E_CFG_ZONA` | Zona horaria inexistente o mal escrita. |
| `E_DESCARGA_INCOMPLETA` | Los bytes recibidos no coinciden con los del listado. |
| `E_FECHA_INVALIDA` | La fecha no existe (`31/02/2026`) o no se entiende. |
| `E_INGESTA_DEMASIADOS` | Más de 500 archivos en la carpeta de entrada. |
| `E_INGESTA_INVALIDA` | Entrada mal armada para la ingesta. |

---

<a id="cobranza"></a>
## Cobranza · `src/pipeline.js`

```text
Cobranza · cableado de los módulos. PURO (usa Util y M0 a M7).

Es la traducción a funciones de lo que hará el shell de n8n: el shell solo hace entrada y salida
(leer la carpeta, leer y escribir tablas, enviar el correo) y entre un paso y otro llama a estas
funciones con los mismos datos. Así el orden de los pasos y las decisiones se prueban aquí, sin n8n.

Orden de una ejecución (entre paréntesis, lo que hace el flujo: entrada y salida):
  (leer control y bloqueos) → iniciar → (tomar el bloqueo con la fila que trae) → (leer el libro del cliente y listar la carpeta)
    → elegirArchivo → (descargar, huella) → decidirProcesado → preparar → (subir el informe, si aplica) → armarEnvio
    → (enviar) → (insertar la fila del libro, soltar el bloqueo)
  Sin archivo: decidirAviso → armarEnvio (tipo «sin_archivo») → (enviar) → (libro, soltar).
Si algo falla: manejarError (aviso a Javier, solo códigos, y la fila «error» del libro).
El flujo nunca interpreta filas de tablas ni decide solo: les pasa las filas a estas funciones y obedece.

Garantías de este archivo:
· La configuración se valida ENTERA antes de tocar un dato del cliente.
· El destinatario sale de la lista blanca de la configuración, jamás del archivo.
· La fila del libro se construye (y valida) ANTES de enviar: si es inválida, no se envía nada.
· Lo que se dice a Javier son códigos; lo que se dice al dueño sale de textos fijos o de M4.
```

**Usa:** `Util`, `M0`, `M1`, `M2`, `M3`, `M4`, `M5`, `M6`, `M7` · **Líneas:** 326

### Funciones públicas

#### `Cobranza.validarConfiguracion(config, fechaCorte)`

```text
Revisa todo lo que puede estar mal en la configuración de un cliente y devuelve los códigos juntos.
No mira ningún dato del cliente. Si no está bien, la ejecución no empieza.
```

_Definida en la línea 47._ Códigos que usa directamente: lanza `E_CFG_DIA_AVISO`, `E_PLANTILLA_FALTANTE`.

#### `Cobranza.fechaCorteDe(ahoraUtc, zona)`

```text
Fecha local del cliente (AAAA-MM-DD) del instante UTC «ahora». Es la fecha de corte de la ejecución.
```

_Definida en la línea 71._ Códigos que usa directamente: lanza `E_AHORA_INVALIDO`.

#### `Cobranza.arrancar(e)`

```text
e: { config, fila_control, fecha_corte, ahora_utc, fila_bloqueo | filas_bloqueo }
→ { accion: 'continuar' | 'detener' | 'omitir_en_curso' | 'alertar_bloqueo_vencido', motivo, codigo?, problemas, guardias }
(con configuración inválida: motivo «CONFIG_INVALIDA», código «E_CFG_INVALIDA» y la lista de problemas)
El bloqueo llega como UNA fila (fila_bloqueo) o como las filas que devolvió la tabla (filas_bloqueo); nunca las dos.
El orden importa: primero los interruptores, después la configuración y al final el bloqueo.
```

_Definida en la línea 85._ Códigos que usa directamente: lanza `E_ARRANQUE_INVALIDO`, `E_BLOQUEO_INVALIDO`; devuelve como resultado `E_BLOQUEO_VENCIDO`, `E_CFG_INVALIDA`.

#### `Cobranza.iniciar(e)`

```text
e: { config, filas_control, filas_bloqueo, ahora_utc } → lo de «arrancar» más { fecha_corte } y, si continúa, { bloqueo_nuevo } (la fila
que hay que escribir para tomar el bloqueo); acción «error» si algo falla con la fecha ya conocida
Lo primero que hace el flujo cada día: fecha local del cliente, interruptor general y bloqueo. La tabla de control debe
tener UNA fila; ninguna o varias es una anomalía y no se procesa (falla cerrada, como un interruptor desconocido).
```

_Definida en la línea 105._ Códigos que usa directamente: lanza `E_ARRANQUE_INVALIDO`.

#### `Cobranza.elegirArchivo(e)`

```text
e: { config, archivos, fecha_corte } → lo de M7.elegirArchivo. Del archivo solo sale el resultado de la elección.
```

_Definida en la línea 125._ Códigos que usa directamente: lanza `E_INGESTA_INVALIDA`.

#### `Cobranza.claveAviso(e)`

```text
Clave del libro del aviso «no llegó»: semana de HOY y la huella de ceros. e: { cliente_id, fecha_corte } → { clave }
```

_Definida en la línea 131._ Códigos que usa directamente: lanza `E_LIBRO_INVALIDO`.

#### `Cobranza.claveArchivo(e)`

```text
Clave del libro de un archivo: semana de su EXPORTACIÓN y su huella. e: { cliente_id, fecha_exportacion, hash_archivo } → { clave }
```

_Definida en la línea 137._ Códigos que usa directamente: lanza `E_LIBRO_INVALIDO`.

#### `Cobranza.decidirAviso(e)`

```text
e: { config, fecha_corte, filas_libro } → { decision: 'esperar' | 'avisar' | 'omitir_ya_avisado', clave }
filas_libro: lo que devolvió el libro al filtrar por la clave del aviso.
```

_Definida en la línea 144._ Códigos que usa directamente: lanza `E_INGESTA_INVALIDA`.

#### `Cobranza.decidirProcesado(e)`

```text
e: { cliente_id, fecha_exportacion, hash_archivo, esperado_bytes, recibido_bytes, filas_libro }
→ { decision: 'procesar' | 'omitir_ya_procesado', clave }
Primero verifica que la descarga llegó entera (si no, lanza E_DESCARGA_INCOMPLETA: un informe con facturas de menos no se
entrega), después busca en el libro del cliente la clave del archivo (semana de su exportación + huella). El bloqueo ya lo
tiene esta ejecución.
```

_Definida en la línea 156._ Códigos que usa directamente: lanza `E_DECISION_INVALIDA`, `E_DESCARGA_INCOMPLETA`.

#### `Cobranza.preparar(e)`

```text
e: { config, guardias, fecha_corte, contenido: { formato: 'csv', texto } | { formato: 'filas', filas }, demo? }
→ { tipo: 'informe', informe, conteos, ensayo } | { tipo: 'incidencia', codigo, aviso, conteos, ensayo }
```

_Definida en la línea 168._ Códigos que usa directamente: lanza `E_PREPARAR_INVALIDO`.

#### `Cobranza.armarEnvio(e)`

```text
e: { config, guardias, fecha_corte, tipo: 'informe' | 'incidencia' | 'sin_archivo', preparado?, enlace_informe?,
     hash_archivo, fecha_exportacion (día local en que se modificó el archivo; no aplica a «sin_archivo»),
     iniciada_utc, terminada_utc }
→ { correo: { asunto, cuerpo_texto, adjunto? }, envio: { accion, destinatarios, motivos, bloqueados }, libro }
La semana del libro es la de la EXPORTACIÓN, no la de la ejecución: un archivo que sigue fresco al cruzar el
lunes no genera un segundo informe. Lanza E_ENVIO_<motivo> si la guardia de envío no deja enviar.
```

_Definida en la línea 207._ Códigos que usa directamente: lanza `E_CFG_ENTREGA_REAL`, `E_ENVIO_INVALIDO`, `E_INCONSISTENCIA_ENSAYO`, `E_LIBRO_INVALIDO`.

#### `Cobranza.alertaOperador(e)`

```text
e: { error, contexto: { cliente_id, workflow, nodo, ejecucion_id }, operador, problemas? (lista de códigos) }
→ { sano, texto: { asunto, cuerpo_texto }, envio }   Todo lo que va a Javier son códigos.
```

_Definida en la línea 271._ Códigos que usa directamente: lanza `E_ALERTA_INVALIDA`.

#### `Cobranza.filaError(e)`

```text
e: { cliente_id, codigo, fecha_corte, hash_archivo?, iniciada_utc, terminada_utc, modo? | (guardias?, modo_cliente?) }
→ fila del libro con estado «error». El modo sale de «modo» o, mejor, de la misma definición de «envío real» que usa M5
(guardias + modo del cliente); si no hay ninguno de los dos, es «dry».
```

_Definida en la línea 310._ Códigos que usa directamente: lanza `E_LIBRO_INVALIDO`.

#### `Cobranza.manejarError(e)`

```text
e: { codigo, contexto, operador, problemas?, cliente_id, fecha_corte?, hash_archivo?, iniciada_utc, terminada_utc, guardias?, modo_cliente? }
→ { alerta: { sano, texto, envio }, fila, fila_codigo }
Todo lo que hay que hacer cuando algo falla, en un solo paso: el aviso a Javier (solo códigos) y la fila «error» del libro.
Sin fecha de corte no hay semana que registrar (fila nula). Si la fila no es válida no se pierde el aviso: se devuelve el
código de por qué no se pudo armar (fila_codigo). El flujo decide qué escribir: un aviso de configuración no toca el libro.
```

_Definida en la línea 292._ Códigos que usa directamente: lanza `E_ALERTA_INVALIDA`.

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `E_AHORA_INVALIDO` | El instante actual no es un instante UTC válido, o la zona no existe. |
| `E_ALERTA_INVALIDA` | Alerta sin código válido. |
| `E_ARRANQUE_INVALIDO` | Entrada mal armada para esa etapa. |
| `E_BLOQUEO_INVALIDO` | Fila de bloqueo o instante mal formados. |
| `E_BLOQUEO_VENCIDO` | Una ejecución anterior murió sin liberar el bloqueo: se avisa, no se reintenta sola. |
| `E_CFG_CLIENTE` | La configuración no es un objeto. |
| `E_CFG_DIA_AVISO` | Día del aviso de «no llegó» fuera de 1–7. |
| `E_CFG_ENTREGA_REAL` | Modo real con informe completo por correo sin `acepta_correo_completo: true`. |
| `E_CFG_INVALIDA` | El arranque se detuvo porque la configuración del cliente tiene problemas; la alerta trae, además, la lista de códigos a corregir. |
| `E_DECISION_INVALIDA` | Datos mal formados para decidir si procesar. |
| `E_DESCARGA_INCOMPLETA` | Los bytes recibidos no coinciden con los del listado. |
| `E_ENVIO_INVALIDO` | Entrada mal armada para esa etapa. |
| `E_FECHA_CORTE_INVALIDA` | Fecha de corte que no es `AAAA-MM-DD`. |
| `E_INCONSISTENCIA_ENSAYO` | Las llaves de ensayo cambiaron entre preparar y enviar, o dos definiciones de «envío real» no coinciden. |
| `E_INGESTA_INVALIDA` | Entrada mal armada para la ingesta. |
| `E_LIBRO_INVALIDO` | La fila del libro tiene columnas de más, valores fuera de forma o estado y código incoherentes. |
| `E_PLANTILLA_FALTANTE` | Hay un escalón sin plantilla. |
| `E_PREPARAR_INVALIDO` | Entrada mal armada para esa etapa. |
| `E_SIN_ARCHIVO` | Marca del libro: se avisó al dueño de que no llegó la exportación de la semana. |
| `E_ENVIO_…` | Familia de códigos que se arma en tiempo de ejecución; ver `CODIGOS.md`. |

---

<a id="envoltorio"></a>
## Envoltorio · `src/envoltorio.js`

```text
Envoltorio · la puerta de entrada del nodo de código de n8n. PURO (usa Util y Cobranza).

El subflujo «Núcleo (puro)» tiene un único nodo de código con todos los módulos y este envoltorio. El flujo de
cada cliente le manda {op, entrada} y recibe {ok, op, resultado} o {ok:false, op, codigo}:
· solo existen las operaciones de la lista (cualquier otra es un error con código);
· ningún mensaje de error sale jamás: solo el código (Util.codigoDe), así que una excepción con datos
  del cliente no puede viajar entre nodos ni quedar en los registros de n8n;
· el resultado se devuelve como JSON plano (lo que viajará entre nodos).
Sin reloj, sin red, sin credenciales: todo lo que hace ya está en los módulos y se prueba allí.
```

**Usa:** `Util`, `Cobranza` · **Líneas:** 45

### Funciones públicas

#### `Envoltorio.operar(op, entrada)`

```text
op: nombre de la operación · entrada: objeto con sus datos.
→ { ok: true, op, resultado } | { ok: false, op, codigo }. Nunca lanza.
```

_Definida en la línea 33._ Códigos que usa directamente: lanza `E_ENTRADA_INVALIDA`, `E_OPERACION_DESCONOCIDA`.

### Constantes públicas

- `Envoltorio.OPERACIONES` = `Object.keys(OPERACIONES)`

### Códigos que puede usar este módulo

| Código | Qué significa (de `CODIGOS.md`) |
|---|---|
| `E_ENTRADA_INVALIDA` | El flujo mandó al núcleo una entrada que no es un objeto. |
| `E_OPERACION_DESCONOCIDA` | El flujo pidió al núcleo una operación que no existe (nombre mal escrito). |
