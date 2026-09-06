# Ventajas comparativas frente a Chollometro

Chollometro es un agregador con comunidad: los usuarios publican, votan y comentan; un
sistema de "grados" ordena la portada. Ese modelo tiene dos fortalezas difíciles de batir
—volumen de ofertas y verificación social— y varias debilidades estructurales que un
sistema automatizado sí puede atacar.

Este documento explica **qué hace distinto ChollosBot, dónde está implementado y qué NO
puede competir**. La honestidad sobre lo segundo importa: un proyecto que ignore las
fortalezas del competidor fracasa.

---

## 1. Precio verificado contra histórico propio, no contra el PVP de la tienda

**El problema.** El descuento que se anuncia en una portada de ofertas suele calcularse
sobre el PVP que declara la propia tienda. Ese PVP se infla con facilidad: un producto que
lleva seis meses a 249 € aparece como "419 € → 249 €, −41 %". La comunidad vota el
porcentaje, no el precio real.

**Qué hace ChollosBot.** Cada lectura de precio se guarda en `precios_historico`, con una
muestra por producto y día. Al clasificar, el descuento se calcula contra la **mediana
propia de 90 días**, y se comprueba también el **mínimo de 30 días** que exige la Directiva
Omnibus:

```
descuento_real_pct = 100 × (1 − precio_actual / mediana_90d)
pvp_inflado        = PVP_tienda > mediana_90d × 1.25
```

Si el PVP está inflado, la oferta se marca, pierde 10 puntos de score y el mensaje publicado
lo dice explícitamente. Si el descuento real baja del 15 %, no se publica aunque la tienda
anuncie un −60 %.

> Implementado en: nodo **«Precio real y descuento verificado»** (WF02) y consulta
> **«Cargar candidatas con histórico»**.

**Limitación honesta:** durante las primeras semanas no hay histórico suficiente
(`muestras_90d < 3`) y el sistema cae en el PVP de la tienda, penalizando 6 puntos por la
incertidumbre. La ventaja crece con el tiempo de operación.

---

## 2. Latencia: publicación en minutos, sin cola de moderación

Una oferta comunitaria pasa por: alguien la ve → la publica → recibe votos → llega a
portada. En productos con stock limitado eso son horas.

Aquí el ciclo es ingesta (cada 15 min) → clasificación (cada 5 min) → publicación (cada
10 min). Del descubrimiento a la difusión hay **menos de 30 minutos en el peor caso**, sin
intervención humana. Las alertas privadas salen en la misma ronda que la publicación.

---

## 3. Alertas personalizadas de verdad

`/alerta portátil 600` crea un filtro persistente. Cuando entra una oferta que casa por
texto (con `unaccent` + `LIKE`) o por categoría, y cuyo precio está por debajo del máximo,
el usuario recibe un privado — y solo uno: `envios_alerta` garantiza que la misma oferta no
se le repite nunca.

El botón **🔔 Avísame si baja** de cada publicación crea la alerta directamente desde el
mensaje, con umbral automático al 95 % del precio actual. Sin salir de Telegram, sin
formularios.

---

## 4. No hay votos que manipular

En un ranking comunitario, el orden lo decide quién vota. Eso es manipulable: cuentas
múltiples, grupos de "calentado", tiendas promocionando su propio stock.

Aquí el orden lo decide una fórmula pública y auditable, guardada en `score_detalle` de
cada oferta:

| Componente | Máx. | De dónde sale |
|---|---:|---|
| Descuento real verificado | 35 | histórico propio de 90 días |
| Mínimo histórico / mejora del mínimo 30 d | 20 | `precios_historico` |
| Fiabilidad del comercio | 15 | tabla `merchants` + tasa de caducidad observada |
| Calidad producto/precio | 15 | evaluación de la IA |
| Interés estimado en España | 10 | evaluación de la IA |
| Comisión de afiliación | **5** | tabla `merchants` / `comisiones_categoria` |
| Penalizaciones | −30 | riesgos detectados, PVP inflado, falta de histórico |

**La comisión pesa 5 puntos sobre 100 y solo actúa como desempate.** Una oferta con 0 % de
comisión y buen descuento gana siempre a una con 10 % de comisión y descuento falso. Esa
decisión de diseño está en el código, no en una declaración de intenciones.

---

## 5. Las ofertas caducadas se marcan solas

Un canal donde la mitad de los enlaces llevan a "producto no disponible" o a un precio
distinto pierde credibilidad rápido.

Cada hora, el WF05 revisa las publicaciones de las últimas 96 h releyendo los datos
estructurados de la ficha. Si el producto está agotado o ha subido más de un 5 %, **edita el
mensaje ya publicado en Telegram** y lo marca como caducado, con el motivo y la hora de
verificación. La oferta pasa a estado `caducada` y deja de aparecer en `/top` y `/buscar`.

---

## 6. Coste total real, no precio de escaparate

Chollometro compara precios de escaparate. ChollosBot calcula:

```
precio_total = precio × (1 + recargo_importación) + envío − cupón
```

Con eso, una oferta de Amazon Italia a 189 € + 12 € de envío se compara honestamente con
una española a 199 € con envío gratis. El campo `recargo_import_pct` de `merchants` permite
modelar aduanas e IVA para tiendas extracomunitarias, y `envia_a_espana = false` descarta de
entrada lo que no llega aquí.

Esto es lo que hace viable la parte de **"ofertas de servicios internacionales"** del
encargo: Amazon .de/.it/.fr, AliExpress y eBay entran en el mismo embudo que las tiendas
españolas, pero comparados por lo que cuesta realmente recibirlos en España.

---

## 7. Antifraude por IA en el momento de clasificar

La IA no solo categoriza: devuelve una lista de `riesgos`. Detecta patrones que un votante
apresurado pasa por alto —reacondicionado mal etiquetado, vendedor de marketplace sin
reputación, dropshipping evidente, especificaciones incoherentes con el precio—. Cada riesgo
resta 4 puntos y se muestra al usuario en el propio mensaje. Si la IA marca `publicable:
false`, la oferta se descarta pase lo que pase con el score.

---

## 8. Histórico de precio consultable desde el propio mensaje

El botón **📉 Histórico de precio** dibuja la curva de 90 días con caracteres de bloque,
directamente en el chat, con mínimo, máximo y precio actual. Sin salir de Telegram, sin
depender de un servicio externo de seguimiento de precios y con datos propios.

---

## 9. Segmentación por canal, sin ruido

`canales` permite un canal general y canales temáticos con su propio score mínimo y su
propio tope de publicaciones por hora. Quien solo quiere informática no recibe ofertas de
pañales. El control anti-ruido (máx. 2 por categoría y ronda, ningún comercio repetido en
20 minutos, tope horario) evita el efecto avalancha de las portadas comunitarias.

---

## 10. Transparencia de la monetización

El aviso de afiliación va **en cada mensaje**, no escondido en un pie de página. Es a la vez
una exigencia legal (ver `docs/legal-y-cumplimiento.md`) y una ventaja de confianza: el peso
de la comisión en el ranking está documentado y es de 5 puntos sobre 100.

---

## Lo que Chollometro hace mejor

Conviene tenerlo presente al planificar:

| Ventaja de Chollometro | Por qué es difícil de igualar | Mitigación posible |
|---|---|---|
| **Volumen y cobertura** | Miles de usuarios detectan errores de precio, ofertas locales y códigos privados que ninguna API expone | Añadir fuentes; permitir envíos por el bot con revisión automática |
| **Verificación social** | Los comentarios detectan la letra pequeña mejor que cualquier heurística | Ir aprendiendo de las caducidades observadas por comercio |
| **Marca y comunidad** | Diez años de tráfico y SEO | Nicho: posicionarse como "el canal que no publica descuentos falsos" |
| **Ofertas en tienda física** | Requieren presencia humana | Fuera de alcance; asumirlo |
| **Cobertura de cupones privados** | Circulan por canales cerrados | Fuera de alcance inicial |

La estrategia razonable no es sustituir a Chollometro, sino **ocupar el hueco de la
confianza**: menos ofertas, todas verificadas, con el precio real medido y las caducadas
marcadas. Un canal de 15 ofertas al día en las que se puede confiar compite bien contra una
portada de 200 en las que hay que investigar cada una.
