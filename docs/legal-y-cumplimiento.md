# Cumplimiento legal

Resumen operativo de las obligaciones que afectan a un canal de ofertas monetizado con
afiliación en España, y de cómo las aborda el sistema. **No es asesoramiento jurídico**: si
el proyecto va a tener volumen o ingresos relevantes, consúltalo con un profesional.

---

## 1. Publicidad encubierta: hay que declarar la afiliación

Un enlace que genera comisión es comunicación comercial. La **Ley 3/1991 de Competencia
Desleal** (art. 26) y la **Ley 34/2002 (LSSI)** exigen que sea identificable como tal, y la
**Directiva Omnibus** refuerza esa obligación en plataformas.

**Implementado:** el aviso va en cada mensaje publicado, en cada aviso privado y en la
respuesta de `/start`:

> 🔗 Enlaces de afiliado: si compras a través de ellos, el canal recibe una comisión sin
> coste adicional para ti.

**Pendiente por tu parte:** ponerlo también en la descripción del canal de Telegram.

Amazon Partners exige además una fórmula concreta, que debe figurar en la descripción del
canal:

> En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen
> los requisitos aplicables.

---

## 2. Anuncio de reducciones de precio (Directiva Omnibus)

Desde 2022, al anunciar una rebaja hay que indicar el **precio más bajo aplicado en los 30
días anteriores**. Aunque la obligación recae sobre el comercio, un canal que anuncia
descuentos asume el mismo riesgo reputacional si los presenta mal.

**Implementado:** `precio_min_30d` se calcula y se muestra en la ficha del mensaje; el
descuento se computa sobre la mediana propia de 90 días, no sobre el PVP declarado; y cuando
el PVP de la tienda no cuadra con el histórico, el mensaje lo advierte (`pvp_inflado`).

Esto convierte una obligación legal en la principal ventaja de producto — ver
`ventajas-vs-chollometro.md`.

---

## 3. Protección de datos (RGPD / LOPDGDD)

Se tratan datos personales: identificador de Telegram, nombre y alertas configuradas.

| Principio | Cómo se cumple |
|---|---|
| Base legítima | Consentimiento explícito: el usuario escribe `/start` y crea sus alertas. Se registra en `suscriptores.consentimiento_en` |
| Minimización | Solo `telegram_user_id`, `chat_id` y nombre público. Ni correo, ni teléfono, ni pagos |
| Clics | Sin IP ni user-agent en claro: solo un hash con sal (`HASH_SALT`) truncado a 32 caracteres, que no permite reidentificar |
| Derecho de supresión | `/baja` desactiva al suscriptor y pausa sus alertas |
| Limitación del plazo | El WF05 purga clics a los 180 días y ofertas descartadas a los 30 |

**Pendiente por tu parte:**
- Publicar una política de privacidad accesible desde la descripción del canal.
- Si operas como empresa o con volumen, registro de actividades de tratamiento (art. 30).
- Ampliar `/baja` a un borrado completo si alguien lo solicita expresamente (hoy desactiva,
  no elimina: `DELETE FROM suscriptores WHERE telegram_user_id = …` lo hace en cascada).

---

## 4. Obtención de datos: límites del scraping

El sistema está deliberadamente limitado a fuentes legítimas:

1. **APIs oficiales** con credenciales propias (Amazon PA-API, AliExpress Portals).
2. **Datafeeds de afiliación**, que son datos cedidos por contrato para esta finalidad.
3. **RSS**, publicados para ser consumidos.
4. **JSON-LD** de las fichas: datos estructurados que las tiendas publican explícitamente
   para los buscadores.

Lo que el sistema **no hace**: parsear el DOM para extraer lo que la tienda no publica de
forma estructurada, rotar user-agents o IPs, saltarse captchas o limitaciones de acceso, ni
acceder a áreas privadas. El user-agent (`SCRAPER_USER_AGENT`) es identificable e incluye una
vía de contacto, y las peticiones se agrupan de 3 en 3 con 2 segundos de espera.

**Pendiente por tu parte:** revisar `robots.txt` y las condiciones de uso de cada sitio antes
de darlo de alta como fuente `html`. Algunas tiendas prohíben expresamente cualquier
extracción automatizada, aunque publiquen JSON-LD.

---

## 5. Condiciones de los programas de afiliación

Motivos habituales de expulsión, todos evitables:

| Regla | Cómo lo respeta el sistema |
|---|---|
| Amazon prohíbe mostrar precios cacheados sin la hora de la lectura | Los precios se refrescan cada hora y el mensaje caducado indica la hora de verificación |
| Amazon prohíbe enlaces de afiliado en correo electrónico y algunos PDFs | La difusión es solo por Telegram |
| Amazon exige la mención del programa | Debe ir en la descripción del canal |
| Casi todas prohíben el "cookie stuffing" | La redirección es 302 explícita tras una acción del usuario, sin iframes ni precarga |
| Muchas prohíben pujar por la marca en SEM | El sistema no hace SEM |
| Casi todas prohíben incentivar el clic | El copy no promete recompensas por pinchar |

Amazon Partners es especialmente estricto: **revisa sus condiciones actuales antes de
publicar** y ten presente que una cuenta nueva sin ventas en 180 días se cierra.

---

## 6. Fiscalidad

Los ingresos por afiliación son rendimientos de actividad económica. En España, con carácter
general:

- Alta censal (modelo 036/037) y epígrafe de IAE correspondiente.
- Alta en autónomos si la actividad es habitual (la interpretación de "habitual" es
  casuística; los ingresos por debajo del SMI han sido objeto de criterios cambiantes).
- IVA: las comisiones de una red establecida en otro estado de la UE suelen ir por
  inversión del sujeto pasivo, con **modelo 349** y alta en el ROI (modelo 036).
- Retención de IRPF según corresponda.

Consúltalo con una asesoría antes de facturar las primeras comisiones.

---

## 7. Responsabilidad sobre la información publicada

El canal publica precios que pueden cambiar en cualquier momento. Conviene incluir en la
descripción del canal:

> Los precios y la disponibilidad se obtienen automáticamente y pueden variar. Comprueba
> siempre el precio final en la tienda antes de comprar. Este canal no vende productos ni
> interviene en la compra.

La verificación horaria y el marcado automático de ofertas caducadas reducen mucho la
exposición, pero no la eliminan.

---

## Lista de comprobación previa al lanzamiento

- [ ] Aviso de afiliación en cada mensaje (ya implementado) **y en la descripción del canal**
- [ ] Mención literal del programa de Amazon en la descripción del canal
- [ ] Política de privacidad publicada y enlazada
- [ ] `HASH_SALT` configurado (sin él, la huella del clic es previsible)
- [ ] Condiciones de uso y `robots.txt` revisados para cada fuente `html`
- [ ] Aviso de variabilidad de precios en la descripción del canal
- [ ] Situación fiscal resuelta antes de la primera liquidación
- [ ] Procedimiento para atender solicitudes de supresión de datos
