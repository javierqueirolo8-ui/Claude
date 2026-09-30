# Criterios para armar la lista de empresas objetivo · Uruguay

**Estado:** borrador para el Punto de control 2 (diseño) · 29-sep-2026 · ajustado el 30-sep-2026 para 15 entrevistas
**No se ha armado ninguna lista.** Este documento fija las reglas; buscar empresas reales empieza
solo cuando las apruebes. **No se ha contactado a nadie.**
**Documentos hermanos:** [plan de entrevistas](01-plan-validacion.md) · [arquitectura en n8n](03-arquitectura-n8n.md)

> No es asesoramiento jurídico. Los textos legales son los oficiales (IMPO, gub.uy) leídos el
> 29-sep-2026. Lo que es interpretación mía lo digo. En Uruguay **no encontré una norma específica
> sobre correo comercial no solicitado**; no lo descarto: confírmalo con un abogado local antes del
> primer envío real.

---

## 1. Qué es la lista y qué no es

- **Es** una lista **corta, armada a mano y con procedencia** de empresas uruguayas que podrían
  tener el problema, para pedir entrevistas y, más adelante, ofrecer el servicio de forma consultiva.
- **No es** una base masiva, ni un raspado de páginas, ni una compra de listas, ni una
  segmentación automática.
- **Tamaño:** primera tanda de **20** candidatas; máximo **80** durante la validación. Para conseguir 15
  entrevistas hacen falta muchas más invitaciones que entrevistas (tabla del
  [plan, sección 9](01-plan-validacion.md#9-notas-síntesis-y-calendario)): la lista es solo una de las
  vías, junto con los referidos y los contadores.
- **Cada dato lleva su fuente y la fecha en que se vio.** Sin fuente, no entra.
- **La lista real no se sube al repositorio.** Contiene datos personales (nombres de decisores).
  Vive fuera de git, en una carpeta cifrada o un Drive con verificación en dos pasos, en ficheros
  `*.real.csv` o dentro de `datos-reales/` (el `.gitignore` los bloquea). En el repositorio solo
  está la [plantilla vacía](../plantillas/lista-objetivo.csv).
- **Los correos los envías tú, a mano.** Ni Claude ni n8n contactan a nadie en esta fase.

---

## 2. Perfil de empresa objetivo

| Criterio | Debe cumplir | Cómo se comprueba con información pública |
|---|---|---|
| **Empresa real y activa en Uruguay** | Razón social, dirección y actividad coherentes. | Al menos **dos fuentes independientes** (su web más un directorio, una nota de prensa o el Diario Oficial). |
| **Tamaño** | Entre 5 y 99 personas ocupadas; **foco 10 a 50**. Las categorías legales combinan personal y ventas ([Decreto 54/992 art. 8, redacción del Decreto 504/007](https://www.impo.com.uy/bases/decretos/54-1992)): pequeña hasta 19 personas y 10.000.000 UI, mediana hasta 99 y 75.000.000 UI. | Estimación por el equipo que muestra su web, el rango de empleados de LinkedIn o la prensa. Es aproximado y se anota como tal. |
| **Vende a crédito a otras empresas (B2B)** | Hay señales de cuenta corriente o plazos de pago entre empresas. | Menciones públicas: «cuenta corriente», «condiciones de pago», «clientes empresariales», «mayorista», «distribuidor de…», «alta de cliente», listas de precios para empresas. Se anota **cuál** vio. |
| **Hay alguien que decide** | Dueño, gerente general o gerente administrativo-financiero identificable. | Página «Nosotros» o «Equipo», LinkedIn, notas de prensa. Si no es público se deja vacío: no se adivina. |
| **Canal de contacto legítimo** | Un canal con fuente (sección 4). | Publicado por la propia empresa, dado por una persona o vía referido. |

**Se excluyen:**
- Comercio minorista y consumo final con cobro al contado o con tarjeta.
- Sector público y empresas del Estado (su proceso de pago es otro problema).
- Entidades financieras reguladas (tienen sistemas y régimen propios).
- Competidores: estudios de recupero, gestoras de cobranza, factoring.
- **Empresas de tu empleo actual o anterior**, y cualquier dato que conozcas por ese vínculo.
- Empresas con relación personal cercana contigo (pueden ser entrevistas de calibración, no lista).
- Personas físicas sin actividad empresarial visible.

---

## 3. Fuentes permitidas, restringidas y prohibidas

El marco es la [Ley 18.331](https://www.impo.com.uy/bases/leyes/18331-2008): el tratamiento de datos
personales exige consentimiento salvo excepciones. Las que usa esta lista son (art. 9): datos que
provienen de **fuentes públicas de información** y **listados** que, para personas jurídicas, se
limitan a razón social, nombre de fantasía, RUT, domicilio, teléfono e identidad de las personas a
cargo. El art. 9-bis define qué es fuente pública: el Diario Oficial y publicaciones oficiales,
las publicaciones en medios masivos, «guías, anuarios, directorios y similares» con datos incluidos
**con el consentimiento del titular**, y otros registros donde prevalezca el interés general. El
art. 21 permite tratar datos para prospección comercial cuando figuran en documentos accesibles al
público o **los facilitó el propio titular**, y le da derecho a pedir el retiro o bloqueo en
cualquier momento.

**Punto delicado (interpretación mía).** El **correo electrónico no figura** en el listado del
art. 9 para personas jurídicas (razón social, nombre de fantasía, RUT, domicilio, teléfono e
identidad de las personas a cargo). Por eso solo se usa un correo que **la propia empresa publica
para contacto** (fuente pública o facilitado por el titular) o que una persona dio de forma
expresa.

| Fuente | Estado | Condición |
|---|---|---|
| **Sitio web de la propia empresa** (contacto, «Nosotros») | Permitida, principal | Datos publicados por el titular. Se registra la URL exacta y la fecha. |
| **Directorios y anuarios** donde la empresa se inscribió | Permitida | Consulta manual, solo lo que el directorio muestra. Sin extracción masiva. |
| **Prensa** (medios masivos) | Permitida | Para identificar empresa y cargo; el contacto se busca en otra fuente. |
| **Diario Oficial** y publicaciones oficiales | Permitida | Solo para identificar la empresa. |
| **LinkedIn** | Permitida solo a mano | Perfil público, un mensaje por vez, sin herramientas de automatización ni extracción ([Acuerdo de Usuario](https://www.linkedin.com/legal/user-agreement)). |
| **Cámaras, gremiales, eventos** (listados públicos de socios o expositores) | Permitida a mano | Como los directorios. |
| **Referidos** | Permitida | Con permiso de quien presenta; se anota quién y cuándo. |
| **Quien te escribe primero** | Permitida | Se usa el canal por el que llegó. |
| Registros de proveedores del Estado (RUPE) y afines | **Por verificar** | No comprobados; no se usan hasta leer sus condiciones de uso. |
| Google Maps o fichas de negocio | Solo consulta manual | Sin extraer datos con herramientas. |
| **Comprar, alquilar o intercambiar listas** | **Prohibida** | No sabes de dónde salen ni qué consentimiento hubo. La comunicación de datos exige consentimiento del titular salvo las excepciones del art. 9 (art. 17). |
| **Raspado o automatización** de LinkedIn, buscadores u otros sitios | **Prohibida** | Incumple términos de uso y multiplica el riesgo. |
| **Adivinar o inferir correos** (`nombre.apellido@`, «verificadores» que prueban direcciones) | **Prohibida** | Es inventar un canal: riesgo de escribir a quien no corresponde. |
| **Datos que te dé un cliente sobre sus deudores** | **Prohibida** | Los datos tratados por cuenta de un tercero no pueden usarse para otro fin ni cederse (art. 30). Jamás sirven para prospectar. |
| Grupos privados, foros cerrados, bases filtradas | **Prohibida** | Procedencia ilícita o desconocida. |

**Lo que comprobé hoy.** La
[herramienta Directorio de Exportadores de Uruguay XXI](https://www.uruguayxxi.gub.uy/es/centro-informacion/articulo/directorio-de-exportadores/)
está disponible al público y cada ficha muestra datos de contacto, página web, monto exportado,
destinos y productos; en la página no vi términos de uso. Se consulta a mano. Sesga hacia
empresas exportadoras, que suelen ser más grandes. La página de socios de la Cámara de Industrias
([ciu.com.uy/socios](http://www.ciu.com.uy/socios)) respondió con una **verificación antirrobots**
cuando la pedí con un script: se mira con navegador, a mano, y no se esquiva esa verificación.
Las demás fuentes se revisan al armar la lista.

---

## 4. La regla del canal: no se inventa ni se infiere ningún correo

Un canal entra en la lista **solo si tiene procedencia**:

| Canal | Se acepta si… | Se guarda |
|---|---|---|
| Correo publicado por la empresa | Está escrito en su web o directorio como contacto (general o de cargo). | Dirección, URL exacta y fecha de captura. |
| Correo de una persona | La persona, o quien la presenta con su permiso, lo entregó. | Dirección, quién lo dio, fecha y permiso. |
| Formulario web | Existe en su página. | URL. |
| LinkedIn | Perfil público. | URL del perfil. |
| Teléfono publicado | Figura en su web. | Número, URL y **consulta del registro No llame antes de cualquier llamada**. |
| Referido | Quien presenta lo confirma. | Quién presenta y fecha. |

Sin canal con fuente, el estado es `canal_por_validar` y **se decide juntos** cómo llegar (referido,
evento, LinkedIn). Esa es la reunión de validación conjunta de la sección 8.

---

## 5. Qué se guarda y qué no

Solo lo necesario (privacidad por defecto, [Decreto 64/020 art. 9](https://www.impo.com.uy/bases/decretos/64-2020)).
La plantilla es [`plantillas/lista-objetivo.csv`](../plantillas/lista-objetivo.csv).

| Campo | Regla |
|---|---|
| `id_lista` | Identificador interno correlativo (`L001`…). No deriva de ningún dato de la empresa. |
| `razon_social`, `nombre_fantasia`, `rut_si_es_publico`, `sitio_web`, `ciudad_departamento` | Datos de la empresa tal como los publica. El RUT solo si figura en su web o directorio. |
| `sector`, `personas_aprox`, `base_tamano` | Estimación y **en qué se basó**. |
| `senal_credito_b2b`, `fuente_credito_url` | La señal concreta de venta a crédito y dónde se vio. |
| `decisor_nombre`, `decisor_cargo`, `fuente_decisor_url` | Solo si es público. Vacío si no. Una URL por dato. |
| `canal_tipo`, `canal_valor`, `canal_fuente_url`, `canal_fecha_captura` | Sección 4. **Sin `canal_fuente_url` no hay `canal_valor`.** |
| `no_llame_consultado`, `no_llame_fecha` | Solo aplica a teléfonos; sin consulta no se llama. |
| `puntaje`, `estado`, `aprobado_por_javier_fecha` | Sección 7. |
| `fecha_ultimo_contacto`, `resultado`, `en_lista_exclusion` | Seguimiento y bajas. |
| `notas_no_sensibles` | Texto libre **sin datos personales sensibles**. |

**No existen a propósito:** documento de identidad, fecha de nacimiento, domicilio o teléfono
particular, familia, opiniones sobre la persona, información de solvencia o de deudas de la empresa
y cualquier dato sensible. La ley prohíbe formar bases que revelen datos sensibles, directa o
indirectamente (art. 18).

---

## 6. Protocolo de primer contacto

Aplica a cada mensaje que envíes, sea correo o LinkedIn.

1. **Identidad completa:** tu nombre real, ciudad y un contacto. La marca, cuando exista. **Sin
   empresa constituida no te presentas como empresa.**
2. **Motivo honesto:** una conversación breve de investigación, sin venta hoy.
3. **De dónde salió el dato**, con la fuente concreta.
4. **Baja simple:** responder «BAJA». Se anota **ese mismo día** en `lista-exclusion` y no se vuelve a
   escribir. Solo se conserva la dirección en esa lista de exclusión (art. 21: retiro o bloqueo en
   cualquier momento).
5. **Derechos:** si alguien pregunta qué datos tienes suyos y de dónde los sacaste, se le responde
   **en 5 días hábiles**: cuando los datos no se recogen del propio titular, la información debe
   dársela en ese plazo desde que la solicita (art. 13). El acceso es gratuito (art. 21).
6. **Texto plano.** Sin adjuntos, sin imágenes, sin enlaces acortados ni píxeles de seguimiento.
7. **Un solo recordatorio** a los 7 días; si no responde, se cierra.
8. **Volumen (mi prudencia, no una norma):** el tope se aplica a los **correos en frío** a
   direcciones públicas: hasta 5 nuevos por semana durante la calibración y hasta 10 por semana
   después; nunca más de 5 en un día. Los referidos, los eventos y los mensajes 1 a 1 de LinkedIn
   **no cuentan** en ese tope. Sales desde una cuenta Gmail personal sin dominio propio ni
   SPF/DKIM: la reputación se cuida con pocos mensajes bien dirigidos, no con el límite de Gmail
   (500 al día). Con 15 entrevistas por conseguir, el correo en frío no basta: el plan depende de la
   red personal y de los contadores.
9. **Teléfono y WhatsApp:** no en frío en esta fase (recuadro del
   [plan de entrevistas](01-plan-validacion.md#4-cómo-llegar-a-ellos-por-orden-de-preferencia)).
   Cuando se use: consultar el registro «No llame» (previa inscripción en la URSEC), conservar la
   prueba 4 años, llamar en horario razonable, con número visible e identificando marca y motivo
   ([Decreto 132/022 arts. 4 y 6](https://www.impo.com.uy/bases/decretos/132-2022)).
10. **Tono consultivo.** Sin urgencia artificial ni afirmaciones que no puedas demostrar.

Nada sale sin el estado `aprobada_para_contacto` y **sin que tú lo envíes**.

---

## 7. Estados, aprobación y prioridad

```
candidata ─▶ verificada ─▶ canal_validado ─▶ aprobada_para_contacto ─▶ contactada ─┬─▶ respondio
                 │              ▲                                                  ├─▶ sin_respuesta
                 ▼              │                                                  └─▶ no_interesada / baja
          canal_por_validar ────┘
          (se decide juntos cómo llegar)
```

| Transición | Quién | Requisito |
|---|---|---|
| `candidata` → `verificada` | Claude prepara, tú revisas | 2 fuentes independientes de que existe y está activa, 1 señal de venta a crédito B2B y ninguna exclusión. |
| → `canal_validado` | **Tú** | Revisamos juntos que el canal tiene fuente y es legítimo. |
| → `aprobada_para_contacto` | **Tú**, por tandas de hasta 5 | Puntaje suficiente y mensaje aprobado. |
| → `contactada` | **Tú, a mano** | Se registra fecha y canal. |
| → `baja` | **Tú**, el mismo día que llega el «BAJA» | Se anota en `lista-exclusion`. No hay automatismo: lo hace una persona. |

**Puntaje (0 a 2 por criterio, máximo 10; propuesta):** ajuste de tamaño · señal de venta a crédito
B2B · decisor identificable · canal legítimo con fuente · aporte a la diversidad de sectores.
Aprobable con 6 o más. El puntaje ordena el trabajo; **no sustituye tu decisión**.

---

## 8. Cómo se arma, paso a paso

| Paso | Qué | Quién |
|---|---|---|
| 1 | Elegir 3 o 4 sectores objetivo entre los del plan de entrevistas. | Tú |
| 2 | Buscar candidatas en las fuentes permitidas (búsqueda y lectura de páginas públicas). Nada de raspado. **LinkedIn lo miras tú, a mano.** | Claude, con tu OK a estos criterios; tú en LinkedIn |
| 3 | Registrar cada candidata en el CSV **real** con fuente y fecha por dato. | Claude |
| 4 | Verificar (dos fuentes) y puntuar. | Claude |
| 5 | **Reunión de validación conjunta:** te presento las empresas y sus perfiles web encontrados; validamos juntos el canal de contacto. No invento ninguno. | Ambos |
| 6 | Aprobar la primera tanda (hasta 5). | Tú |
| 7 | Contactar a mano y anotar el resultado. | Tú |

Los ficheros reales se entregan en la conversación o como archivo adjunto; **el maestro lo guardas
tú fuera del repositorio**. El entorno donde trabajo es efímero: no es un lugar de custodia.

---

## 9. Base de datos personales: inscripción, derechos y retención

- **Inscripción.** «Toda base de datos pública o privada debe inscribirse» (art. 29) y la formación
  de bases de datos es lícita cuando están debidamente inscriptas (art. 6). El trámite
  [de la URCDP](https://www.gub.uy/tramites/inscripcion-bases-datos-personales) (actualizado el
  15-jun-2026) **no tiene costo**, es en línea y se hace con identidad electrónica **personal**;
  consultas al 2901 0065, opción 3. **Mi lectura:** la lista de prospectos y las notas de
  entrevistas contienen nombres y cargos de personas: son una base de datos personales, y la
  excepción de uso personal o doméstico (art. 3, literal A) no cubre la prospección comercial.
  **Recomendación:** consultar a la URCDP e inscribirlas **antes de guardar la primera lista real**,
  y guardar la respuesta por escrito. La inscripción exige declarar, entre otros, el tiempo de
  conservación (art. 29 G): por eso se fija abajo.
- **Seguridad** (art. 10): fichero cifrado o Drive con verificación en dos pasos; acceso solo tuyo;
  sin copias en chats ni correos; borrar copias locales.
- **Transferencias internacionales** (art. 23): si la lista vive en un servicio fuera de Uruguay
  (Drive, Sheets…), hay una transferencia. La URCDP considera adecuados a los países de la UE y el
  EEE, Andorra, Argentina, el sector privado de Canadá, Guernsey, Isla de Man, Islas Feroe, Israel,
  Japón, Jersey, Nueva Zelanda, el Reino Unido y Suiza, más las entidades sujetas a la ley
  surcoreana y **las organizaciones incluidas en el «Listado del Marco de Privacidad de Datos» de
  EE. UU.** ([Res. 23/021](https://www.gub.uy/unidad-reguladora-control-datos-personales/institucional/normativa/resolucion-n-23021),
  [Res. 63/023](https://www.gub.uy/unidad-reguladora-control-datos-personales/institucional/normativa/resolucion-n-63023)).
  **No verifiqué** que tu proveedor figure en ese listado ni que no haya una actualización posterior:
  compruébalo antes de guardar datos reales allí.
- **Retención (propuesta, a declarar en la inscripción):** candidatas sin contactar, 6 meses desde
  la captura; contactadas sin respuesta, 3 meses desde el contacto; «no interesada», 12 meses o
  hasta que lo pida; lista de exclusión, mientras dure la actividad (solo dirección y fecha).
- **Derechos:** acceso gratuito, retiro o bloqueo en cualquier momento (art. 21) y respuesta de
  información en 5 días hábiles (art. 13). Procedimiento: quien lo pida recibe respuesta tuya
  escrita con los datos que hay y su fuente.

---

## 10. Lo que puede salir mal

| Riesgo | Cómo se evita |
|---|---|
| Escribir a un destinatario equivocado. | Ningún canal sin fuente; validación conjunta; envío manual tuyo; una sola dirección por mensaje. |
| Datos desactualizados. | Fecha en cada dato; se vuelve a mirar la fuente antes de contactar. |
| Queja ante la URCDP o la URSEC. | Fuente y motivo en el primer mensaje, baja el mismo día, inscripción de la base, sin teléfono ni WhatsApp en frío. |
| Daño de reputación del remitente. | Pocos mensajes, texto plano, sin seguimiento de aperturas, un solo recordatorio. |
| Ampliar los datos sin darse cuenta. | El esquema es cerrado; `notas_no_sensibles` no admite datos personales sensibles. |
| Fuga de la lista. | Fuera del repositorio; cifrado; retención corta; ficheros `.real` ignorados por git. |
| Sesgo hacia empresas grandes o conocidas. | Cuota por sector; puntaje con criterio de diversidad. |

**Controles automáticos propuestos para cuando se desarrolle** (no se programan hasta tu OK): un
verificador del CSV que rechace un canal sin URL de fuente, un correo con formato de patrón
inferido, una fila `aprobada` sin fecha de aprobación, un teléfono sin consulta «No llame», y
duplicados; con pruebas sobre filas sintéticas.
