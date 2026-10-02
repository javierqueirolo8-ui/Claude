# Guía práctica · cómo funciona el programa, cómo se programa y cómo conseguir clientes

**Estado:** 1-oct-2026 · escrita para ti: no hace falta saber programar para seguirla.
**Documentos hermanos:** [plan de entrevistas](01-plan-validacion.md) · [lista objetivo](02-criterios-lista-objetivo.md) · [arquitectura en n8n](03-arquitectura-n8n.md) · [código](../nucleo/README.md)

> Esta guía explica lo que ya está decidido y construido; no cambia ninguna regla. Lo que dice sobre clientes son
> **hipótesis a validar** con las entrevistas, no resultados: para Uruguay no hay datos de morosidad entre empresas
> ni tasas de respuesta que pueda verificar. No es asesoramiento jurídico. **Nada de lo que sigue se ha enviado a nadie.**

---

## 1. El programa en una página

**Para qué sirve.** Una pyme que vende a crédito a otras empresas pierde caja y tiempo porque nadie reclama a tiempo.
Cada semana el programa le dice **qué facturas están vencidas, hace cuántos días y cuánto suman**, y le deja escrito el
mensaje para cada una. La persona lo revisa y lo envía con un clic. **El programa nunca escribe a un deudor por su cuenta.**

### Lo que pasa cada semana (con un cliente de ejemplo)

| # | Qué ocurre | Quién |
|---|---|---|
| 1 | El cliente exporta de su sistema la lista de «facturas pendientes» (Excel o CSV) y la deja en una carpeta compartida. En el primer piloto te la manda a ti y la cargas tú (decisión D3). | El cliente |
| 2 | Cada mañana a las 08:30 (hora de Montevideo) el programa mira si hay un archivo nuevo. Si no llegó, espera el lunes y el martes; el miércoles avisa **una sola vez** al dueño. (Hoy, en tu banco de pruebas, se dispara a mano.) | El programa |
| 3 | Comprueba que el archivo sea razonable (tipo, tamaño, fecha reciente) y le saca una «huella». La huella sirve para no procesar dos veces el mismo archivo; si el cliente lo corrige, la huella cambia y sí se procesa. | El programa |
| 4 | Lee las filas: entiende `1.234,56` y las fechas, y **aparta con un código** lo dudoso (fecha imposible, moneda desconocida) en lugar de adivinar. Si se aparta demasiado, no manda informe: avisa que el archivo tiene problemas. | El programa |
| 5 | Calcula el atraso de cada factura, los tramos (1-30, 31-60, 61-90 y más de 90 días) y los totales **por moneda**: pesos y dólares nunca se suman. | El programa |
| 6 | Sugiere un paso por factura: recordatorio amable, segundo aviso o aviso firme. Si el cliente la marcó «en disputa», no hay borrador. | El programa |
| 7 | Redacta el borrador con una plantilla fija (tono formal, en plural, sin amenazas; una prueba automática lo vigila) y un botón que abre el WhatsApp o el correo **del propio dueño** con el texto ya puesto. | El programa |
| 8 | Arma el informe (una página HTML) y lo manda **solo** a las direcciones de una lista blanca: el informe completo, o —lo recomendado con datos reales— un correo corto con totales y un enlace a una carpeta de salida. | El programa |
| 9 | Anota en un libro que ese archivo ya se procesó (solo contadores y huellas, sin nombres ni importes) y suelta el candado que evita dos ejecuciones a la vez. | El programa |
| 10 | El dueño o el administrativo revisa el informe y envía los mensajes que quiera. | El cliente |

**Cómo se ve:** abre [`nucleo/demo/informe-demo.html`](../nucleo/demo/informe-demo.html) en el navegador (datos inventados). Es lo que
se enseña en las entrevistas.

### Por qué es seguro (y por qué eso es parte de lo que vendes)

- **Solo lectura** sobre los sistemas del cliente y **aprobación humana** siempre.
- El destinatario sale **solo de una lista blanca** fijada por ti; máximo 3 direcciones; sin copias ocultas.
- Está en **ensayo** por defecto: todo va a tu bandeja. Para que algo llegue al dueño hacen falta **dos llaves** (el interruptor
  general sin ensayo **y** el cliente en modo real).
- **No usa inteligencia artificial** y no puntúa a los deudores: es una cuenta de fechas y plantillas, repetible y explicable.
- No guarda facturas ni datos de deudores; los errores llevan **solo un código**; ante la duda **falla cerrado** (aparta y avisa).

### Lo que NO hace (v1)

No escribe en los sistemas del cliente, no escribe a los deudores, no consulta ni informa a bureaus, no cobra ni genera enlaces de pago,
no acepta conexiones desde internet. Todo eso queda «para más adelante, con OK nuevo» ([documento 03, sección 2](03-arquitectura-n8n.md)).

### Qué hay hoy y qué falta

| Ya está (verificado) | Falta para un cliente real |
|---|---|
| El «cerebro»: unas 2.500 líneas de código en 11 módulos, con más de 450 pruebas, 140 averías provocadas a propósito y un simulador del día completo. | **Entrada real**: carpeta de Drive de solo lectura (o la carga manual del primer piloto). Hoy es una tabla de pruebas. |
| En tu n8n: 3 flujos `[COB-DEV]` inactivos con datos ficticios. En 54 pasos dieron lo mismo que el simulador. | **Salida real**: el envío por Gmail con credencial tuya. Hoy el «correo» es una fila en una tabla. |
| Informe y correo de demostración. | Disparador diario, flujo de alertas, latido semanal y limpieza (se activan solo con tu OK). |
| Reglas de seguridad probadas (lista blanca, doble llave, falla cerrada, sin duplicados). | La guía de verificación manual para no técnicos, el contrato, la unipersonal y la inscripción de la base de datos. |

---

## 2. Cómo está programado

### 2.1 La idea: separar «pensar» de «mover cosas»

Hay **dos capas**, y esa separación es lo que hace al sistema probable y seguro:

1. **El núcleo (puro)**: funciones de JavaScript que reciben datos y devuelven datos. No tienen red, ni archivos, ni reloj, ni azar:
   **no pueden filtrar nada porque no tienen por dónde sacarlo**. Aquí vive toda la lógica que importa (qué se aparta, cuántos días de atraso,
   a quién se puede escribir, qué dice el borrador). Se prueba con miles de casos sin necesidad de n8n.
2. **El flujo de n8n (el *shell*)**: solo hace entrada y salida. Lee la carpeta, lee y escribe tablas, manda el correo y, en cada paso,
   le pregunta al núcleo qué hacer. Es un dibujo de cajas (nodos) unidas por flechas.

Piensa en el núcleo como un empleado de escritorio que solo sabe hacer cuentas con lo que le ponen delante, y en el flujo como el cadete que va a buscar
los papeles y lleva el resultado. El empleado no sale de la oficina.

### 2.2 Mapa de archivos (todo en `nucleo/`)

| Quiero cambiar… | Archivo | Qué hace |
|---|---|---|
| Cómo se leen las facturas (formatos, fechas, importes) | `src/m1-normalizar.js` | Archivo → facturas limpias + filas apartadas con código |
| Cómo se calcula el atraso y los tramos | `src/m2-antiguedad.js` | Días, tramos, totales por moneda, sugerencia |
| El texto de los recordatorios | `src/m3-borradores.js` | Plantillas fijas, tono formal en plural, enlaces |
| Cómo se ve el informe | `src/m4-informe.js` | Página HTML inerte (sin scripts ni red) |
| A quién se puede escribir | `src/m5-guardia-envio.js` | Lista blanca y doble llave: **la única fuente de destinatarios** |
| Qué se anota y cómo se evitan duplicados | `src/m6-registro.js` | Errores solo con código, libro, clave de idempotencia, candado |
| Qué archivo se procesa y cuándo avisar que no llegó | `src/m7-ingesta.js` | Elección del archivo, aviso de «no llegó» |
| El orden de un día | `src/pipeline.js` | El cableado de todos los módulos (el plano del flujo) |
| Los datos de un cliente | su configuración (ejemplo en `datos-ficticios/config-ejemplo.js`) | Qué columnas son cuáles, destinatarios permitidos, modo, zona horaria |
| El flujo de n8n | `n8n/generar-shell.js` | **Genera** el flujo de 65 nodos; no se edita a mano en n8n |

Los códigos de error están en [`CODIGOS.md`](../nucleo/CODIGOS.md).

### 2.3 Cómo se cambia algo sin romper nada (la receta)

1. Se edita **un** archivo de `src/` (o un generador de `n8n/`).
2. `./verificar.sh` corre todo en segundos: sintaxis, más de 450 pruebas en **seis zonas horarias**, que el paquete de n8n sea el mismo
   código y que los flujos generados estén al día. Si algo se rompe, dice cuál.
3. `node mutaciones.js` (varios minutos, cuando se tocan reglas importantes) rompe el código a propósito, de a una avería por vez, y
   exige que alguna prueba lo note. Si una avería pasa sin que nadie se entere, falta una prueba.
4. `node n8n/generar.js` y `node n8n/generar-shell.js` producen el texto de los flujos; ese texto **se copia a n8n** (lo hago yo con tu OK).
5. `node n8n/comparar-despliegue.js` compara lo que quedó en el servidor con lo generado: debe decir «IGUAL» (mismos nodos, mismas conexiones,
   inactivo, sin datos fijados).
6. Se prueba en tu n8n con los clientes ficticios `esc-…`; el simulador dice qué debe pasar y el flujo real debe dejar **exactamente lo mismo**
   (se compara con una huella de las tablas).

Ejemplos concretos:

- **Un cliente nuevo con otro formato de Excel**: no se toca código; se escribe su configuración (`mapeo_columnas`) y se prueba con un archivo
  de ejemplo de ese formato.
- **Cambiar la redacción de un recordatorio**: `src/m3-borradores.js`. Las pruebas exigen que no aparezcan amenazas ni referencias a informes
  comerciales o acciones legales.
- **Agregar un día de aviso distinto**: es un valor de la configuración (`dia_aviso_sin_archivo`).

### 2.4 Qué es cada cosa en n8n (glosario mínimo)

| Palabra | Qué es, en simple |
|---|---|
| Flujo (*workflow*) | Un dibujo de pasos conectados que n8n ejecuta. |
| Nodo | Un paso: leer una tabla, correr un código, mandar un correo. |
| Disparador (*trigger*) | Lo que lo pone en marcha (un horario, un clic). Hoy: un clic tuyo; en producción: las 08:30 de cada día. |
| Subflujo | Un flujo que otro flujo llama, como una función. El núcleo es uno. |
| Tabla de datos | Una planilla chica dentro de n8n. Guarda solo contadores, el candado y el interruptor general. |
| Credencial | La llave de un servicio (Gmail, Drive). La creas tú; yo no la veo. |
| Huella (SHA-256) | Un resumen único del contenido de un archivo. Si cambia una coma, cambia la huella. |
| Idempotencia | Que correr dos veces lo mismo no produzca dos efectos. |
| Falla cerrada | Ante la duda se detiene y avisa; nunca adivina ni sigue. |
| Ensayo (*dry run*) | Todo se hace, pero lo que saldría al cliente va a tu bandeja. |

---

## 3. Cómo se sigue programando

### 3.1 Para cerrar la Etapa 2 (sin clientes ni datos reales)

1. **La serie de roturas a propósito** en tu n8n: está preparada (`node n8n/escenarios.js roturas`) y falta correrla; son unas 8 aprobaciones tuyas seguidas.
2. **Gmail real, solo hacia tu bandeja**: tú creas la credencial en n8n (yo no la veo; con Google en modo «Testing» el acceso vence a los 7 días) y la «tabla de
   correos» se reemplaza por el nodo de Gmail, siempre detrás de la guardia de la lista blanca y en ensayo. Los datos siguen siendo ficticios.
3. **Drive real con una carpeta de pruebas tuya** (opcional): para comprobar la lectura real del archivo antes de tocar la de ningún cliente.
4. **La guía de verificación manual** para no técnicos (punto de control 3).

### 3.2 Etapa 3 (con un cliente real)

No arranca hasta que se cumplan las condiciones de la [sección 13 del documento 03](03-arquitectura-n8n.md): un cliente que confirme interés real, la
unipersonal en BPS/DGI, el contrato de encargo, la inscripción de la base de datos y una región/transferencia resuelta. Entonces, cada paso con tu OK y
probado antes del siguiente:

1. **Entrada real** desde la carpeta del cliente, como lector (o tu carga manual en el primer piloto).
2. **Disparador diario** y los flujos de **alertas, latido y limpieza** (el de alertas solo se puede probar con ejecuciones activas).
3. **Un flujo por cliente**, generado desde una plantilla: cada uno con su credencial, su horario, su interruptor y su lista blanca.
4. **Endurecer** el servidor ([lista de la sección 10.7](03-arquitectura-n8n.md)).
5. **Modo sombra**: el informe real llega solo a ti, enmascarado, y se compara con el cálculo manual del cliente durante varias semanas.

**Tu rol no es programar.** Es aprobar, probar con la guía y tomar las decisiones. Si algún día quieres leer o tocar el código, lo que ayuda es saber lo básico
de JavaScript y de n8n; las pruebas automáticas te protegen de romper las reglas de seguridad sin darte cuenta.

---

## 4. Cómo conseguir clientes

### 4.1 Primero entender qué se busca

Hoy **no se vende nada**. Se buscan conversaciones para saber si hay dolor, si compartirían datos y si pagarían (las ocho hipótesis del
[plan](01-plan-validacion.md)). Los clientes salen de ahí: cada entrevista termina con un pedido concreto (una segunda reunión con quien cobra,
un ejemplo del listado, una presentación). La [escalera de compromiso](01-plan-validacion.md) (N0 a N5) mide qué es interés real:
solo N4 y N5 cuentan. Mientras no exista la unipersonal no se factura ni se cobra.

### 4.2 Tu tiempo: 2 a 3 horas por día

Las 15 entrevistas son unas **22 horas** (invitación, conversación y notas) y, sin contactos previos, conviene contar con el doble hasta que la bola de nieve
funcione: unas 45 horas.
Con 14 a 21 horas por semana, **las horas dejan de ser el límite**: el límite es cuánta gente responde y por cuáles canales. Por eso conviene
gastar el tiempo extra en los canales que no dependen del correo en frío (que tiene tope):

| Bloque diario | Tiempo | En qué |
|---|---|---|
| A · Captación | 45 a 60 min | Mensajes 1 a 1 en LinkedIn, contadores, eventos, seguimientos. |
| B · Conversaciones | 60 a 90 min | Entrevistas de 25 a 30 minutos y sus notas (dentro de los 30 minutos posteriores). |
| C · Orden | 20 a 30 min | Registrar respuestas, actualizar la lista, elegir la tanda de mañana (hasta 5; la apruebas tú). |
| Viernes | +30 min | Síntesis semanal: qué hipótesis se confirmó, cuál se refutó, qué mensaje funcionó. |

Ritmo de partida: semana 0 preparar; semanas 1 a 3 primeros contactos y 2 o 3 entrevistas de calibración; semanas 4 a 9 unas 2 o 3 entrevistas por
semana. Puntos de control del plan: al final de la semana 4, al menos 5 entrevistas hechas o agendadas; de la 6, 8 hechas; de la 8, 12 hechas. Si un punto no se
cumple, se replantean los canales antes de bajar la muestra. Con más horas se puede llegar antes; el plan de 10 semanas queda como tope.

### 4.3 Canales, en orden de preferencia

1. **Contadores y estudios contables** (la palanca principal). Un contador conoce a decenas de pymes. Se le pide una charla de 20 minutos
   sobre **cómo cobran sus clientes** y, si le parece útil, que presente a dos o tres. Nunca se piden listados de clientes. Su evidencia es indirecta
   y se anota aparte.
2. **Cámaras y eventos** (en la lista hay organizaciones para mirar: la Asociación Nacional de Micro y Pequeñas Empresas, la Cámara Nacional de
   Comercio y Servicios y el Colegio de Contadores, Economistas y Administradores, entre otras). Revisa sus calendarios: la ANMYPE publica un
   «Calendario de cursos y eventos» y en julio de 2026 se anunció en Salto un curso sobre cobranzas para pymes, señal de que el tema convoca. Objetivo por
   evento: dos o tres conversaciones y una tarjeta, no una venta.
3. **LinkedIn**, mensaje 1 a 1 **escrito a mano**, sin herramientas de automatización ni extracción (lo prohíbe su acuerdo de usuario).
4. **Correo** a una dirección que **la propia empresa publica para contacto**, con el protocolo de identidad, motivo, fuente del dato y baja del
   [documento 02, sección 6](02-criterios-lista-objetivo.md). Tope de 5 por semana al comienzo y 10 después. **No alcanza por sí solo**: con un
   8 % de aceptación supuesta harían falta unas 19 semanas.
5. **Bola de nieve**: al cerrar **cada** entrevista pides dos presentaciones. Es el canal que más crece con el tiempo.
6. **Contenido propio** (opcional): una publicación breve por semana sobre el costo de cobrar tarde, con el cálculo de ejemplo (500.000 al año
   × 10 días ÷ 365 ≈ 13.700 de circulante liberado; es un ejemplo, no un dato medido). Quien escribe primero da su consentimiento.

**Lo que no se hace en esta fase:** llamar o escribir por WhatsApp en frío (registro «No llame», Ley 19.996 art. 181), comprar o alquilar listas,
raspar sitios, adivinar correos, usar seguimiento de aperturas o secuencias automáticas, presentarte como empresa constituida ni prometer funciones,
plazos o precios.

### 4.4 Mensajes (borradores; nada se envía sin tu OK y sin probarlo antes en tu bandeja)

Los de invitación (referido, correo a dirección pública, LinkedIn) están en el [Anexo A del plan](01-plan-validacion.md). Dos más:

**A4 · Para un contador o estudio contable**

> Asunto: Una consulta breve sobre cómo cobran sus clientes
>
> Hola [nombre o «equipo»]:
>
> Soy Javier Queirolo, consultor independiente en [ciudad]. Te escribo a esta dirección porque figura en [FUENTE: URL] como contacto del estudio.
>
> Estoy investigando cómo las pymes uruguayas que venden a crédito hacen el seguimiento de las facturas vencidas, y ustedes ven a muchas desde
> adentro. ¿Podríamos conversar 20 minutos? **No te vendo nada** y no necesito nombres de clientes: me sirve entender qué ven que funciona y qué no.
> Si además te parece útil, al final te pido que me presentes a dos o tres empresas, solo si ellas quieren.
>
> Si prefieres que no te escriba más, responde «BAJA» y no volveré a hacerlo (solo conservaré la dirección en una lista de exclusión). Puedes pedirme
> qué datos tengo tuyos, de dónde los obtuve o que los borre.
>
> Gracias, Javier Queirolo · [teléfono] · [ciudad]

**A5 · Un solo recordatorio a los 7 días**

> Asunto: Re: [asunto anterior]
>
> Hola [nombre]: te escribí hace una semana por una charla breve sobre facturas vencidas. Si no es el momento o no eres la persona indicada, no hay problema:
> respóndeme «BAJA» y no vuelvo a escribirte. Gracias igual. Javier

Después de ese recordatorio el contacto se cierra.

### 4.5 De la entrevista al cliente

```
conversación (N1-N3)  →  segunda reunión con quien cobra (N4)  →  carta de intención o precio aceptado (N5)
        →  piloto en sombra con datos reales (solo cuando exista contrato)  →  unipersonal + registro de la base  →  cliente
```

- En cada entrevista hay **un pedido concreto**: «¿me muestras un ejemplo del listado con los nombres tapados?» o «¿puedo hablar con quien cobra?».
- La maqueta (el informe de demostración) se enseña **solo en el bloque 5** del guion y con datos ficticios.
- No se pregunta «¿lo usarías?» ni «¿pagarías X?»: se pregunta por **hechos pasados** («cuéntame la última vez que una factura se pasó de fecha»).
- Una entrevista que confirma todo suele ser una entrevista cortés; busca activamente lo que la refuta.

### 4.6 Oferta y precio

- Fijado el 30-sep: **USD 150 al mes** más **USD 400 de instalación** (`[P]`), y **3 clientes de pago recurrentes** como meta de validación (`[N]`).
- Lo que vendes no es «otro recordatorio» (Saldea cuesta de 49 a 99 € por mes y Chaser desde 199 £): es la **implantación** en pymes que no adoptan software por falta de tiempo o de integración. Cada lunes la persona sabe qué reclamar, a quién y con qué mensaje en
  cinco minutos, sin depender de que alguien se acuerde.
- El precio **se prueba preguntando**, no ofreciendo: cuánto les cuesta hoy el atraso, qué pagan por herramientas parecidas y quién firmaría un gasto así.
  El criterio económico del plan se cumple con al menos 4 de 15 entrevistas que den una cifra propia que llegue a `[P]`.

### 4.7 Qué anotar cada semana

| Dato | Para qué |
|---|---|
| Invitaciones enviadas y respuestas, **por canal** | Saber qué canal funciona y cuál abandonar (si tras 20 mensajes casi nadie responde, cambia el mensaje o el canal). |
| Entrevistas hechas, y nivel de compromiso de cada una (N0 a N5) | Aplicar las reglas de decisión fijadas de antemano. |
| Presentaciones obtenidas por la bola de nieve | Es el indicador de que el canal empieza a rendir. |
| Hipótesis confirmadas o refutadas (`registro-hipotesis.csv`) | Decidir con evidencia entre GO, AJUSTAR, PLAN B, AMPLIAR o DESCARTAR. |

Las notas llevan un código (`E01`, `E02`…) y **no los nombres** de la persona, la empresa ni sus deudores; los datos de contacto van en un fichero
aparte, fuera del repositorio.

### 4.8 Una idea para atraer interesados sin escribirles en frío (necesita tu OK)

Una **herramienta gratuita de un solo archivo**: la persona abre una página en su navegador, carga su Excel de facturas pendientes y ve su cartera por
antigüedad y moneda, con los borradores. **Todo ocurre en su computadora: nada sale ni llega a ti** (es la «variante local» del
[documento 03, sección 12](03-arquitectura-n8n.md), ya prevista como contingencia). Sirve de tres maneras:

1. En la entrevista: «pruébalo con tu archivo, no sale de tu equipo». Es la forma más directa de llegar a N3 y N4.
2. Como imán en LinkedIn y en eventos: quien lo prueba y lo encuentra útil te escribe primero (y ahí sí hay consentimiento).
3. Como demostración del valor antes de pedir datos: baja la reticencia a compartirlos.

Se apoya en piezas ya probadas (el cálculo de antigüedad y los borradores). No se construye hasta que lo apruebes; si prefieres, lo evaluamos después
de las primeras entrevistas.

### 4.9 Tus primeras dos semanas

- [ ] Elegir **3 o 4 sectores** de la lista y descartar las filas que no sirvan (y cualquier empresa con la que tengas vínculo).
- [ ] Mirar a mano en LinkedIn el **tamaño** de las empresas que quedan (5 a 99 personas; foco 10 a 50).
- [ ] Decidir cómo te presentas: **consultor independiente**, con tu nombre real (sin marca ni empresa hasta tener la unipersonal).
- [ ] Completar la **ficha informativa** con tus datos reales (ciudad, contacto, dónde se guardan las notas y por cuánto tiempo).
- [ ] Probar cada mensaje **en tu propia bandeja** y aprobar tú cada tanda (hasta 5) antes de enviarla a mano.
- [ ] Ensayar el guion **en voz alta** con cualquier persona; las 2 o 3 primeras entrevistas reales son de calibración.
- [ ] Anotar en tu calendario dos eventos para ir en persona, y una charla de 20 minutos con un contador.
- [ ] Confirmar la **fecha objetivo de decisión** (propuesta: fin de la semana 8 si se cumplen los puntos de control de las semanas 4 y 6;
  semana 10 como tope).

---

## 5. Riesgos y decisiones que siguen abiertos

- **D7 y D8 (consulta a la URCDP/URSEC y revisión legal) en espera** hasta tener un cliente en N4 o N5. Mi lectura de la Ley 18.331 es que la lista con
  nombres de personas y las notas de entrevistas son una base de datos personales que conviene inscribir antes de guardarla (art. 29); mientras tanto la
  lista es a nivel empresa y sin nombres de personas, y no se contacta a nadie sin tu OK.
- **Datos reales en São Paulo no valen** sin resolver la transferencia internacional; São Paulo es solo para datos ficticios (documento 03, sección 10.3).
- **Gmail personal sin dominio** daña la reputación si se abusa: pocos mensajes, texto plano, sin adjuntos. Antes de cualquier envío real hace falta dominio
  propio con SPF y DKIM.
- **El mercado es una hipótesis.** Si las entrevistas muestran poco dolor o reticencia a compartir datos, las reglas de decisión dicen qué hacer
  (descartar, plan B o variante local). Está bien que salga «no»: es el objetivo de validar antes de construir más.
