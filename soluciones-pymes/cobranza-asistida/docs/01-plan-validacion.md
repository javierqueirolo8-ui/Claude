# Plan de entrevistas de validación · Cobranza asistida (Uruguay)

**Estado:** borrador para el Punto de control 2 (diseño) · 29-sep-2026 · **ajustado el 30-sep-2026: 15 entrevistas**
**Nada de este plan se ha ejecutado:** no se ha contactado a nadie, no hay lista real ni entrevistas hechas.
**Nicho:** cobranza asistida de facturas vencidas · **Plan B:** presupuestos y seguimiento en oficios
**Documentos hermanos:** [criterios de la lista objetivo](02-criterios-lista-objetivo.md) · [arquitectura en n8n](03-arquitectura-n8n.md)

> No es asesoramiento jurídico. Las citas legales son de los textos oficiales (IMPO, gub.uy) leídos
> el 29-sep-2026; lo que es interpretación mía está marcado como tal.

---

## 1. Para qué sirve

Antes de construir nada para un cliente hay que saber tres cosas, **en este orden**:

1. **¿Hay dolor?** Las pymes uruguayas que facturan a crédito a otras empresas, ¿tienen facturas
   vencidas de forma recurrente y les cuesta caja o tiempo?
2. **¿Dejarían ver sus datos?** ¿Aceptarían compartir cada semana una exportación de su cartera
   pendiente (la «foto de facturación») con un proveedor externo, bajo contrato? Es la hipótesis
   que puede hundir este nicho. Si la respuesta es no, entra el plan B.
3. **¿Pagarían?** Cuánto, quién decide y cómo compran.

Las entrevistas **no venden nada**. Sirven para decidir con evidencia entre cuatro salidas:
construir la v1, ajustarla, pasar al plan B o descartar el nicho (sección 8).

**Lo que sabemos y lo que no.** El dato de mercado que respalda el nicho es español: el período
medio de pago de las empresas fue de 80,5 días frente a 60 legales y solo el 30,4 % de lo facturado
se cobró a tiempo (Observatorio de la Morosidad de CEPYME, abril de 2026, vía
[Autónomos y Emprendedor](https://www.autonomosyemprendedor.es/articulo/pymes/pymes-solo-cobran-cada-tres-facturas-tiempo-ultimo-observatorio-morosidad/20260410165245053056.html)).
**Para Uruguay no hay un dato verificable de morosidad entre empresas**; por eso este plan existe.

---

## 2. Hipótesis y cómo se sabrá si son falsas

Cada hipótesis tiene una señal que la confirma y **otra que la refuta**. Se anotan las dos.

| ID | Hipótesis | La confirma | La refuta | Pregunta clave (bloque del guion) |
|---|---|---|---|---|
| H1 | **Dolor.** Tienen facturas vencidas de forma recurrente y les afecta la caja. | Cuenta un caso de los últimos 90 días con monto aproximado y días de atraso. | «No tengo problema» y lo respalda con hechos (cobran al contado o en plazo). | «Cuéntame la última vez que una factura se pasó de fecha» (B2) |
| H2 | **Proceso débil.** Cobrar depende de una persona que reclama cuando puede, sin calendario. | Describe un proceso ad hoc, con olvidos. | Ya tiene un proceso sistemático que funciona (p. ej. su sistema avisa solo). | «¿Cómo se entera y quién reclama?» (B3) |
| H3 | **Causa.** Parte del atraso se debe a falta de seguimiento, no solo a disputas o clientes que pagan cuando quieren. | Reconoce facturas olvidadas o reclamos tardíos. | Casi todo el atraso es por disputas, insolvencia o poder de negociación del cliente: un recordatorio no lo cambia. | «¿Por qué se atrasó esa?» (B2) |
| H4 | **Aprobación humana.** Un sistema que solo prepara borradores y avisos, con envío manual, les basta y les da tranquilidad. | Prefiere revisar antes de enviar. | Exige que el sistema escriba al deudor solo. | Reacción a la maqueta (B5) |
| H5 | **Datos compartibles (crítica).** Compartirían periódicamente una exportación de su cartera con un externo, bajo contrato. | Acepta mostrar un ejemplo real con nombres tapados y explica bajo qué condiciones compartiría. | «Eso no sale de la empresa», sin condiciones que lo cambien. | B6 |
| H6 | **Datos disponibles.** Pueden exportar «facturas pendientes con vencimiento e importe» de su sistema, aunque sea a Excel. | Nombra el informe o planilla concretos. | Los datos están en papel, dispersos o el sistema no exporta. | B6 |
| H7 | **Precio.** Pagarían una cuota mensual (implantación + mantenimiento) porque el retorno se ve. | Compara con lo que ya gasta o con lo que pierde y da una cifra. | «Lo hago yo» o «es caro» sin cifra. | B7 |
| H8 | **Decisor.** Decide el dueño o gerente; el administrativo es quien lo usa. | Nombra quién firma y quién opera. | Decide un contador externo o casa matriz. | B7 |

**Sesgo a vigilar:** una entrevista que confirma todo suele ser una entrevista cortés. Los hechos
pasados («lo hice, me costó, pagué») valen; las intenciones («me encantaría») no.

---

## 3. A quién entrevistar

**Perfil.** Dueños, gerentes o administrativos de empresas uruguayas que **facturan a crédito a
otras empresas** (B2B). Tamaño: las categorías legales son microempresa (hasta 4 personas
ocupadas y 2.000.000 UI de ventas anuales sin IVA), pequeña (hasta 19 y 10.000.000 UI) y mediana
(hasta 99 y 75.000.000 UI) ([Decreto 54/992 art. 8, redacción del Decreto 504/007](https://www.impo.com.uy/bases/decretos/54-1992)).
El foco son **pequeñas y medianas bajas: 10 a 50 personas**. Mi hipótesis (a comprobar en las
entrevistas): una microempresa rara vez tiene a alguien dedicado a cobrar, y una mediana alta ya
suele tener sistema y un área de créditos.

**Sectores con venta a crédito entre empresas** (a validar, no asumidos): distribución y
mayoristas, servicios B2B (mantenimiento, TI, imprenta y publicidad, transporte y logística),
construcción y subcontratistas, industria liviana, insumos agropecuarios y médicos.

**Cuotas.** **15 entrevistas completas** que cuentan como evidencia, más 2 o 3 de calibración que no cuentan.
- Al menos 3 sectores distintos y como máximo 4 entrevistas por sector; mezcla de tamaños.
- Al menos 3 personas **administrativas** (quien realmente cobra) y como máximo 3 **contadores o
  estudios contables** que atienden pymes: ven la cartera de muchas empresas y son un canal de
  referencia. Su evidencia es **indirecta** (hablan de sus clientes): cuenta, pero se anota aparte
  en la columna `rol`.
- Las de calibración (red cercana) sirven para ensayar el guion y **no cuentan** como evidencia:
  la cortesía de un conocido contamina la señal.

**Se excluyen** del conteo: familiares y amigos cercanos, comercios que cobran al contado, empresas
del Estado, competidores directos y empresas de las que se espera ya una venta.

---

## 4. Cómo llegar a ellos (por orden de preferencia)

| # | Canal | Regla |
|---|---|---|
| 1 | **Red personal y referidos**: «¿a quién conoces a quien le pase esto?» | Mejor respuesta y sin fricción legal. Pedir que la persona presente o pida permiso. |
| 2 | **Contadores y estudios contables** | Que presenten a dos o tres clientes suyos. Nunca pedir listados de clientes. |
| 3 | **Eventos y comunidades** (cámaras, jornadas de ANDE, coworkings, meetups) | Presencial, tarjeta y conversación. |
| 4 | **LinkedIn**, mensaje 1 a 1 escrito a mano | Sin automatizar ni extraer datos: el [Acuerdo de Usuario](https://www.linkedin.com/legal/user-agreement) lo prohíbe. |
| 5 | **Correo** a una dirección que **la propia empresa publica** para contacto | Solo con el protocolo de la sección 6 del documento 02 (identidad, motivo, fuente del dato, baja). Volumen bajo. |
| — | **Teléfono o WhatsApp en frío** | **No en esta fase.** Ver recuadro. |

> **Por qué no llamar ni escribir por WhatsApp en frío todavía.**
> La [Ley 19.996 art. 181](https://www.impo.com.uy/bases/leyes/19996-2021) crea el registro «No llame»:
> quien ofrezca bienes o servicios por telecomunicaciones **no puede dirigirse a los inscriptos**,
> y puede inscribirse «toda persona física o jurídica». El
> [Decreto 132/022](https://www.impo.com.uy/bases/decretos/132-2022) (art. 1) incluye llamadas,
> mensajes de texto, aplicaciones móviles y plataformas similares, y (art. 4) exige a quien contacta:
> **inscribirse en la URSEC para consultar el registro**, consultar la última actualización (vale
> 30 días), **guardar la prueba 4 años**, llamar desde un número visible e identificar empresa,
> marca y motivo. El horario razonable es de lunes a viernes de 9 a 21 y sábados de 9 a 19 (art. 6).
> Las excepciones son la relación contractual vigente y el permiso expreso del inscripto.
> **Mi lectura (no verificada con la URSEC):** pedir una entrevista a un desconocido con vistas a
> ofrecerle un servicio cae del lado prudente de esa norma. Mientras no esté resuelta la inscripción
> en la URSEC, el teléfono y el WhatsApp se usan **solo** con quien pidió la llamada o dio su
> número expresamente. Email y LinkedIn no tienen registro consultable; se mitigan con identidad,
> motivo y baja en el primer mensaje.

---

## 5. Transparencia con el entrevistado y datos personales

**Qué se le dice al empezar** (texto en el Anexo B): quién eres, qué investigas, que hoy no vendes
nada, cuánto dura, que puede saltarse cualquier pregunta, que **no se graba** salvo permiso
expreso, qué se anota, dónde se guarda y que puede pedir que se borre. Eso cubre lo esencial de la
información previa que exige la [Ley 18.331 art. 13](https://www.impo.com.uy/bases/leyes/18331-2008)
(finalidad, existencia de la base de datos, identidad del responsable, derechos y si hay
transferencias internacionales, por ejemplo cuando las notas viven en un servicio en la nube fuera de
Uruguay). El resto (domicilio o contacto del responsable y destinatarios) se entrega por escrito con la
**ficha informativa** del Anexo B, que se envía a quien la pida.

**Reglas de datos** (mínimo necesario, Decreto 64/020 art. 9):

- **No pedir ni anotar nombres de sus clientes o deudores.** Se habla de «un cliente grande»,
  «una distribuidora», con rangos de monto. Así no se recogen datos de terceros que no hacen falta.
- Las notas usan un código (`E01`, `E02`…), **sin nombre ni empresa**. Los datos de contacto del
  entrevistado van en un fichero **aparte**.
- **Nada de esto se sube al repositorio.** Los ficheros reales viven fuera de git (en una carpeta
  cifrada o un Drive con verificación en dos pasos) y el `.gitignore` bloquea los nombres
  `datos-reales/`, `*.real.*` y `*-real.*`.
- Cuando me pases notas para analizarlas, hazlo con el código `E01`, sin nombres.
- Las notas y los contactos de entrevistas forman **una base de datos personales**: aplica lo mismo
  que a la lista objetivo (inscripción en la URCDP, sección 9 del documento 02).
- **No prometer** funciones, plazos ni precios, y no mostrar datos de otros entrevistados.

---

## 6. Guion de la entrevista (25 a 30 minutos)

Reglas: hablar de **su vida, no de tu idea**; preguntar por el **pasado**, no por futuros
hipotéticos; escuchar el 70 % del tiempo; pedir siempre un **siguiente paso concreto**; enseñar la
maqueta solo en el bloque 5.

| Bloque | Min | Qué se pregunta | Qué se escucha |
|---|---|---|---|
| **B0 Apertura** | 2 | Texto del Anexo B. Consentimiento para tomar notas. | — |
| **B1 Contexto** | 5 | ¿A qué se dedica la empresa? ¿Cuántas personas? ¿Quién factura y quién cobra? ¿Venden a crédito? ¿Plazos habituales (30, 60, 90)? ¿Cómo les pagan (transferencia, cheque diferido, efectivo)? ¿Desde qué sistema emiten las facturas? | Volumen, dependencia de pocos clientes, sistema y quién opera. |
| **B2 La última vez** | 8 | «Cuéntame la última vez que una factura se pasó de fecha sin cobrar.» ¿Qué monto, cuántos días, cómo se enteraron, qué hicieron, cuánto tardó, qué costó (caja, crédito bancario, tiempo, relación)? ¿Por qué se atrasó? | H1 y H3. Hechos, no opiniones. |
| **B3 Proceso actual** | 5 | ¿Quién revisa lo vencido, cada cuánto y con qué (planilla, sistema, memoria)? ¿Cómo reclaman (llamada, WhatsApp, correo)? ¿Quién decide cuándo insistir? ¿Hay clientes a los que no se animan a reclamar? | H2. Olvidos, irregularidad, dependencia de una persona. |
| **B4 Alternativas** | 3 | ¿Qué probaron? (módulo de cobranzas del sistema, planillas, contador, gestor externo, descuento de documentos). ¿Por qué siguen o lo dejaron? | Competencia real y costo de cambio. |
| **B5 Reacción** | 4 | Se muestra la maqueta del Anexo C. ¿Qué falta? ¿Qué sobra? ¿Qué riesgo ven? ¿Dónde lo leerían (correo, WhatsApp)? ¿Qué tendría que pasar para usarlo? | H4. Objeciones, no elogios. |
| **B6 Datos** | 3 | Hoy, ¿cómo sacan la lista de facturas pendientes? ¿La pueden exportar? ¿Me mostrarían un ejemplo con nombres tapados? ¿Qué les preocuparía de que la vea alguien externo? ¿Qué condiciones necesitarían (contrato, confidencialidad, borrado)? | H5 y H6. Condiciones concretas. |
| **B7 Dinero y decisión** | 2 | ¿Cuánto les cuesta hoy el atraso, aproximadamente? ¿Qué pagan ya por herramientas parecidas? ¿Quién firmaría un gasto así? | H7 y H8. |
| **B8 Cierre** | 2 | «¿Con quién más debería hablar?» ¿Puedo volver a escribirte? **El pedido:** una segunda conversación con quien cobra, o un ejemplo del listado. | Nivel de compromiso (sección 7). |

**Preguntas prohibidas** porque inducen respuestas falsas: «¿te gustaría una herramienta que…?»,
«¿pagarías X por esto?», «¿te parece buena idea?», «¿lo usarías?». Se reemplazan por hechos
pasados y por un pedido concreto.

---

## 7. Escalera de compromiso: qué cuenta como evidencia

| Nivel | Qué hizo el entrevistado | Cuenta como |
|---|---|---|
| N0 | Cortesía: «qué buena idea». | Nada. |
| N1 | Contó un caso real con cifras aproximadas. | Evidencia de H1 y H3. |
| N2 | Describió su proceso y herramientas concretos. | H2, H6. |
| N3 | Aceptó mostrar un ejemplo real (con nombres tapados) del listado que sacaría, o enseñó la pantalla. | **H5 y H6.** |
| N4 | Aceptó una segunda reunión con quien cobra, con fecha; o un piloto en sombra con datos reales cuando exista contrato. | Interés real. |
| N5 | Se comprometió por escrito a contratar un piloto a un precio (correo firmado o carta de intención no vinculante) o pagó. | **H7 y compra.** |

Hasta que exista la unipersonal no se puede cobrar ni facturar (decisión del 29-sep-2026); por eso
el máximo alcanzable en esta fase es N5 como compromiso escrito, no como pago.

---

## 8. Reglas de decisión, fijadas antes de empezar

Fijarlas antes evita interpretar los resultados a favor de la idea. **Son mi propuesta y se pueden
ajustar ahora; después no.** Con 15 entrevistas sigue sin haber significación estadística, aunque
menos débil que con 10: si en 9 de 15 aparece el dolor (60 %), el intervalo de confianza al 95 %
(Wilson) va aproximadamente del **36 % al 80 %**. El método sirve para **descartar ideas malas**, no para
probar que una es buena.

Los umbrales conservan las proporciones del plan de 10 (60 %, 50 %, 40 % y 20 %) y se redondean
siempre hacia el lado más exigente: para dar el GO, hacia arriba (H2: 7,5 pasa a 8); para descartar,
hacia abajo (H1: 4,5 pasa a 4). Se evalúan **en este orden** y decide la primera que se cumple.

| # | Resultado | Condición sobre las 15 entrevistas completas | Qué se hace |
|---|---|---|---|
| 1 | **DESCARTAR** | H1 en 4 o menos. | Volver a la lista de nichos. |
| 2 | **PLAN B** | H1 en 9 o más, pero H5 con nivel N3 o superior en 3 o menos. | Decidir juntos: nicho 3 (presupuestos en oficios) o una variante en la que **los datos no salen de la empresa** (ver documento 03, sección 12). |
| 3 | **GO** | H1 en 9 o más **y** H2 en 8 o más **y** H5 con nivel N3 o superior en 6 o más **y** al menos 3 en N4 o N5 **y** se cumple el criterio económico de abajo. | Preparar el piloto. Cuando **un** cliente confirme interés real, iniciar BPS/DGI **antes** de tocar sus sistemas o facturar, más contrato y registro de la base de datos. |
| 4 | **AJUSTAR** | H1 en 9 o más y H5 con nivel N3 o superior en 6 o más, pero H2 en 7 o menos (ya tienen proceso), o menos de 3 en N4 o N5 (nadie se compromete), o no se cumple el criterio económico. H3 orienta **cómo** ajustar. | Cambiar el alcance: un solo sector, otra parte del proceso u otro precio. Volver a validar. |
| 5 | **AMPLIAR** | Cualquier caso intermedio: H1 entre 5 y 8, o H1 en 9 o más con H5 con nivel N3 o superior en 4 o 5. | 5 entrevistas más, **una sola vez**. Después se decide con lo que haya. |

**Criterio económico de viabilidad (lo defines tú antes de empezar).** Una idea puede tener dolor y datos
compartibles y aun así no ser un negocio. Antes de la primera entrevista hay que fijar:
- `[P]`: la cuota mensual mínima por cliente con la que el servicio te sirve. **Por definir.**
- `[N]`: cuántos clientes de pago necesitas para que el proyecto valga la pena. **Por definir.**

El criterio se cumple cuando al menos **4 de las 15** entrevistas (propuesta) dan un rango de precio que
llega a `[P]`: H7, con una cifra propia o comparada con lo que ya gastan o pierden, no un «me parece
bien». `[N]` no se puede probar con 15 entrevistas; sirve después para dimensionar el esfuerzo comercial
a partir de la proporción de empresas candidatas que salga de ellas. Hasta que fijes `[P]` y `[N]`, la fila
GO no puede activarse.

---

## 9. Notas, síntesis y calendario

**Notas.** Se completan **dentro de los 30 minutos** posteriores, con la plantilla
[`notas-entrevista.md`](../plantillas/notas-entrevista.md). Separar tres cosas: lo que dijo (cita
literal), lo que hizo (hechos pasados) y lo que interpreto. Cada hipótesis se puntúa en
[`registro-hipotesis.csv`](../plantillas/registro-hipotesis.csv). También se registra **quién
respondió y quién no** (tasa de respuesta por canal): un buen resultado entre los que contestan
puede ocultar que casi nadie contestó.

| Semana | Trabajo | Requiere tu OK |
|---|---|---|
| 0 | Aprobar este plan, el guion y los mensajes. Fijar `[P]` y `[N]`. Preparar registros fuera del repositorio. Consultar a la URCDP por la inscripción de la base (documento 02, sección 9). Armar la primera lista de 20 (documento 02). | Sí, todo. |
| 1 | 2 o 3 entrevistas de calibración con red cercana. Ajustar el guion. | Cada contacto, antes. |
| 2 a 6 | 15 entrevistas, unas 3 por semana. Síntesis de 30 minutos cada semana. Ajustar la lista según lo aprendido. | Cada tanda de contactos, antes. |
| 7 | Síntesis final y decisión según la sección 8. Si sale AMPLIAR: 2 semanas más para 5 entrevistas. | Sí. |

**Cuántas invitaciones hacen falta.** Para 15 entrevistas completas hay que invitar a bastantes más
personas. Son **escenarios, no datos**: no tengo una tasa de respuesta verificable para Uruguay.

| Aceptación supuesta | Invitaciones necesarias |
|---|---|
| 40 % (referidos cálidos) | 38 |
| 25 % | 60 |
| 15 % | 100 |
| 8 % (correo en frío a direcciones públicas) | 188 |

Con esos números, **la red personal y los contadores son lo que hace viable el plan**: el correo en
frío, limitado a 10 por semana, no alcanza para 15 entrevistas en 5 semanas (documento 02, sección 6).

**Tiempo estimado (orden de magnitud):** unos 90 minutos por entrevista completa entre invitación,
conversación de 30 minutos y notas, es decir, unas **22 horas** para las 15, sin contar la calibración.

---

## 10. Riesgos del propio proceso

| Riesgo | Mitigación |
|---|---|
| Sesgo de cortesía y de confirmación. | Reglas de decisión fijadas antes; hechos pasados sobre intenciones; el peso está en la escalera de compromiso. |
| Muestra pequeña y sesgada a quien responde. | Registrar tasa de respuesta; ampliar si hay dudas; buscar refutaciones a propósito. |
| Contactar a alguien que no debía o de forma inadecuada. | Ningún contacto sin tu OK; lista con fuente y fecha por dato; protocolo de primer mensaje; volumen bajo. |
| Prometer o mostrar de más y quemar la confianza. | Solo maqueta con datos ficticios; nada de precios ni fechas comprometidas. |
| Recoger datos de terceros sin necesidad. | No anotar nombres de deudores; códigos `E01`; ficheros fuera del repositorio. |
| Reputación del remitente (Gmail sin dominio propio). | Pocos mensajes a mano, sin adjuntos ni seguimiento de aperturas; ver documento 02. |
| Confundir interés con compra. | Solo N4 y N5 cuentan como interés real. |
| No llegar a 15 entrevistas por falta de respuesta. | Priorizar referidos y contadores; registrar la tasa de respuesta desde la primera semana; si a la semana 4 hay menos de 8 hechas, replantear canales antes de bajar la muestra. |

---

## Anexo A · Borradores de invitación (NO ENVIADOS)

Son borradores para tu revisión. No se envía nada sin que los revises, los pruebes en tu bandeja y
des el OK explícito. Los corchetes son datos que hay que completar; **no se inventa ninguno**.
La marca todavía no está definida; hasta que exista la unipersonal firmas con tu nombre real.

**A1 · Por referido** (el que más conviene)

> Asunto: [Nombre del referente] me sugirió escribirte
>
> Hola [nombre]:
>
> Soy Javier Queirolo, consultor independiente. [Nombre del referente] me comentó que en [empresa]
> ustedes facturan a crédito a otras empresas. Estoy investigando cómo las pymes uruguayas llevan el
> seguimiento de las facturas vencidas y me gustaría conversar 25 minutos contigo, **sin venderte
> nada**. Me sirve saber cómo lo hacen hoy, aunque sea de forma sencilla.
>
> Si te viene bien, dime dos horarios de la semana próxima. Y si prefieres que no te escriba más,
> responde «BAJA» y no lo haré.
>
> Gracias,
> Javier Queirolo · [teléfono] · [ciudad]

**A2 · Correo a una dirección que la empresa publica para contacto**

> Asunto: Consulta breve sobre facturas vencidas en [empresa]
>
> Hola:
>
> Soy Javier Queirolo, consultor independiente en [ciudad]. Te escribo a esta dirección porque
> figura en [FUENTE: página web de la empresa, URL] como contacto de la empresa.
>
> Estoy investigando cómo las pymes uruguayas que venden a crédito hacen el seguimiento de las
> facturas vencidas. Busco conversar 25 minutos con quien se ocupe de eso [o con el dueño], sin
> ánimo de venta. Si no eres la persona indicada, ¿me la podrías indicar?
>
> Si prefieres que no te escriba más, responde «BAJA» y no volveré a hacerlo (solo conservaré tu
> dirección en una lista de exclusión para no escribirte de nuevo). Puedes pedirme en cualquier
> momento qué datos tengo tuyos, de dónde los obtuve o que los borre.
>
> Gracias,
> Javier Queirolo · [teléfono]

**A3 · Mensaje breve de LinkedIn** (la nota es corta; se escribe a mano, uno por uno)

> Hola [nombre], soy Javier Queirolo, consultor independiente. Estoy investigando cómo las pymes
> uruguayas gestionan facturas vencidas. ¿Aceptarías 25 minutos de charla, sin venta? Si no, sin
> problema.

**Reglas comunes.** Sin adjuntos, sin imágenes ni enlaces de seguimiento, en texto plano. Un solo
recordatorio a los 7 días como máximo; si no hay respuesta, se cierra el contacto y no se vuelve a
escribir. Si responde «BAJA», se anota la dirección en la lista de exclusión ese mismo día.
**Decisión pendiente tuya:** si añades «todavía sin empresa constituida». Mi recomendación es no
presentarte como empresa y no decir nada que sugiera que ya existe; firmar solo como consultor
independiente evita confusiones.

---

## Anexo B · Apertura y cierre (texto para decir en voz alta)

**Apertura.**
«Gracias por el tiempo. Soy Javier Queirolo, consultor independiente. Estoy investigando cómo las
pymes de Uruguay llevan las facturas vencidas. **Hoy no te vendo nada**: quiero entender cómo lo
hacen ustedes. Dura unos 25 minutos y puedes saltarte cualquier pregunta. No grabo. Voy a tomar notas
sin tu nombre ni el de la empresa, con un código, y no necesito nombres de tus clientes: si hace
falta, di "un cliente grande". Tus datos de contacto los guardo aparte solo para escribirte si tú
quieres, y los borro cuando me lo pidas. ¿Te parece bien?»

**Cierre.**
«Gracias. Para terminar: ¿con quién más debería hablar? ¿Puedo escribirte si más adelante tengo algo
concreto que enseñarte? Y una última pregunta: ¿me podrías mostrar un ejemplo del listado que sacan
hoy, con los nombres tapados, o presentarme a quien se ocupa de cobrar?»

**Ficha informativa (se envía por escrito a quien la pida).**

> - **Quién trata tus datos:** Javier Queirolo, [ciudad], [correo o teléfono de contacto].
> - **Qué datos:** tu nombre, cargo, empresa y el medio por el que te contacté; y las notas de la
>   conversación, **sin tu nombre** (con un código).
> - **Para qué:** entender cómo las pymes gestionan las facturas vencidas y, solo si tú lo quieres,
>   escribirte más adelante.
> - **Con quién se comparten:** con nadie. **Dónde se guardan:** [lugar y país del almacenamiento].
> - **Cuánto tiempo:** [plazo], o hasta que pidas su borrado.
> - **Tus derechos:** acceder a tus datos sin costo, rectificarlos y pedir su retiro o bloqueo en
>   cualquier momento, respondiendo al mensaje que recibiste.

---

## Anexo C · Maqueta del informe (todos los datos son ficticios)

Es lo que se enseña en el bloque B5. Muestra el resultado que llegaría **solo al dueño o al
administrativo**. Los nombres, importes y números son inventados y así se rotulan.

> **EJEMPLO CON DATOS FICTICIOS**
> Asunto: Resumen semanal de cobranza · lunes 5 de octubre · 6 facturas vencidas
>
> **Resumen.** Vencido: $U 412.300 y US$ 3.150 en 6 facturas de 5 clientes.
> Por antigüedad: 1 a 30 días, 3 facturas · 31 a 60, 2 · 61 a 90, 0 · más de 90, 1.
>
> **Para revisar y enviar (tú decides, el sistema no envía nada a tus clientes).**
> Se muestran 3 de las 6 filas:
>
> | # | Cliente (ficticio) | Factura | Importe | Vence | Atraso | Sugerencia |
> |---|---|---|---|---|---|---|
> | 1 | Cliente Uno S.R.L. | A 1001 | $U 85.000 | 25/09 | 10 días | Recordatorio amable |
> | 2 | Cliente Dos S.A. | A 0987 | US$ 3.150 | 10/09 | 25 días | Segundo aviso |
> | 3 | Cliente Tres Ltda. | A 0944 | $U 61.300 | 30/06 | 97 días | Aviso firme o llamada |
>
> **Borrador para la fila 1** (copia el texto o pulsa el botón):
> «Hola, te escribo de [tu empresa] para recordarte la factura A 1001 por $U 85.000, con vencimiento
> el 25/09. Si ya la pagaste, ignora este mensaje. Cualquier duda, estoy a tu disposición.»
> [Copiar] · [Abrir WhatsApp] · [Abrir correo]
>
> *Este informe se generó a partir de la planilla del 5/10. Si algo no cuadra, responde a este
> correo antes de usarlo.*

Notas de diseño de la maqueta: sin amenazas ni referencias a informes comerciales o a acciones
legales en los borradores; la sugerencia se calcula solo con los días de atraso, **no puntúa ni
perfila al deudor** (ver documento 03, sección 7).
