# Monetización: el enlace con % de venta

Todo enlace publicado genera una comisión sobre la venta. Este documento describe cómo se
construye ese enlace, cómo se atribuye cada venta a la oferta concreta que la generó y cómo
se mide el rendimiento real.

---

## 1. Cadena completa de un clic

```
Mensaje en Telegram
   │  botón "🛒 Ver oferta"
   ▼
https://tudominio.es/webhook/r/18422          ← redirector propio (WF06)
   │  · registra el clic en `clicks`
   │  · genera SubID único: o18422-cgeneral-7f3a1b
   │  · lo inyecta en el deeplink
   ▼  302
https://www.awin1.com/cread.php?awinmid=15839&awinaffid=XXXX
        &clickref=o18422-cgeneral-7f3a1b&ued=https%3A%2F%2F…
   │  la red pone su cookie de seguimiento
   ▼
Ficha del producto en la tienda  →  compra
   │
   ▼
POST https://tudominio.es/webhook/postback/awin   ← postback S2S (WF06)
        clickref=o18422-cgeneral-7f3a1b&saleAmount=199&commissionAmount=3.98
   │
   ▼
Tabla `conversiones` → vista `v_rendimiento_ofertas` → informe diario
```

**Por qué el redirector propio y no el enlace directo:**

1. **Se mide el clic real**, no solo la impresión. Sin eso no hay CTR ni EPC.
2. **Se puede cambiar de red sin reeditar mensajes.** Si mañana PcComponentes pasa de Awin
   a un programa directo, se actualiza `merchants.plantilla_url` y los mensajes de hace
   tres meses siguen funcionando y monetizando.
3. **El SubID se genera en el momento del clic**, no al publicar: cada clic es distinguible.
4. **Se detectan enlaces rotos**: una oferta borrada redirige al canal en vez de a un 404.
5. **Privacidad**: no se almacena IP ni user-agent en claro, solo un hash con sal
   (`HASH_SALT`) truncado a 32 caracteres, suficiente para deduplicar clics sin identificar
   a nadie.

---

## 2. Formato del SubID

```
o{oferta_id}-c{canal}-{nonce}
o18422-cgeneral-7f3a1b
```

Ese identificador viaja hasta la red de afiliación en su parámetro nativo y vuelve en el
postback. Al volver, `Normalizar postback` extrae `o(\d+)` y ata la venta a la oferta. Con
eso se puede responder a preguntas que un enlace plano no permite:

- ¿Qué **categorías** convierten mejor? (EPC por categoría, en el informe diario)
- ¿Qué **canal** vende más, el general o el temático?
- ¿Compensa publicar ofertas de más de 300 €, o convierten mejor las de 20-60 €?
- ¿Qué **comercios** tienen mucho clic y poca venta? (síntoma de precio desactualizado)

Ese bucle de realimentación es lo que permite ajustar el scoring con datos propios en lugar
de por intuición.

---

## 3. Parámetro de SubID por red

Cada red lo nombra distinto. El mapa vive en `config/afiliados.json` y en
`merchants.param_subid`:

| Red | Parámetro | Cookie | Comisión típica | Postback S2S |
|---|---|---:|---|---|
| Amazon Partners | `ascsubtag` | 24 h | 1 %–10 % según categoría | No |
| Awin | `clickref` | 30 d | 1 %–10 % | Sí |
| Tradedoubler | `epi` | 30 d | 1 %–8 % | Sí |
| Admitad | `subid` | 30 d | 2 %–12 % | Sí |
| AliExpress Portals | `aff_fcid` | 30 d | 2 %–9 % | Parcial |
| eBay Partner Network | `customid` | 24 h | 1 %–4 % | No |
| Impact.com | `subId1` | 30 d | 2 %–20 % | Sí |

Para las redes sin postback (Amazon, eBay) la conciliación es manual o por descarga
periódica de informes; las tablas y vistas admiten igualmente esas filas insertadas por
lotes en `conversiones`.

> Las horquillas de comisión son orientativas y públicas a fecha 2025-2026. **Sustitúyelas
> por las de tu panel** antes de usarlas para proyectar ingresos: `merchants.comision_pct` y
> `comisiones_categoria` son la fuente de verdad del sistema.

---

## 4. Comisión por categoría (el caso de Amazon)

Amazon no paga un porcentaje por comercio, sino por categoría de producto: moda ~10 %,
electrónica ~2 %. Por eso existe `comisiones_categoria`, que la consulta de candidatas
prefiere sobre la comisión base:

```sql
COALESCE(comision_categoria_pct, comision_base_pct)
```

Consecuencia práctica: **el mix de categorías determina los ingresos más que el volumen**.
100 ventas de moda a 10 % rinden lo mismo que 500 de electrónica a 2 %. El informe diario
muestra el EPC por categoría precisamente para poder ajustar dónde se pone el foco.

---

## 5. Estimación vs. realidad

Hay dos cifras y no conviene confundirlas:

- **`comision_estimada`** (por oferta): `precio × comision_pct / 100`. Es el ingreso *si*
  alguien compra. Se calcula al clasificar.
- **`conversiones.comision`**: lo que la red confirma que se ha ganado de verdad.

El informe diario muestra las dos, junto con el EPC:

```
EPC = comisión confirmada / clics
```

El EPC es la métrica que de verdad importa: dice cuánto vale cada clic que genera el canal,
y permite comparar categorías, canales y comercios en la misma unidad.

Orden de magnitud realista para un canal de ofertas en España: EPC entre 0,05 € y 0,30 €;
tasa de conversión clic→venta entre el 1 % y el 5 %. Con 2 000 clics al mes eso son entre
100 € y 600 € brutos. **No es un negocio de márgenes altos**: vive del volumen y de la
retención, y esa retención depende de no publicar basura — de ahí que el peso de la comisión
en el score sea deliberadamente bajo.

---

## 6. Configurar el postback en cada red

En el panel de la red, apartado de *postback / server-to-server tracking*:

```
https://tudominio.es/webhook/postback/awin?token=TU_POSTBACK_TOKEN
```

Cada red sustituye sus propias macros. Ejemplos habituales:

| Red | URL a configurar |
|---|---|
| Awin | `.../postback/awin?token=T&clickref={clickRef}&saleAmount={saleAmount}&commissionAmount={commissionAmount}&id={transactionId}&status={status}` |
| Tradedoubler | `.../postback/tradedoubler?token=T&epi={epi}&amount={orderValue}&commission={commission}&id={orderNumber}` |
| Admitad | `.../postback/admitad?token=T&subid={subid}&order_sum={order_sum}&payout_sum={payment_sum}&id={action_id}&status={status}` |

`Normalizar postback` acepta los nombres de campo de todas ellas y unifica el resultado, así
que añadir una red nueva no suele requerir tocar el código.

**Seguridad**: sin `POSTBACK_TOKEN` correcto el endpoint responde 401. Es un endpoint
público: sin token, cualquiera podría inyectar conversiones falsas y ensuciar las métricas.

---

## 7. Lista de comprobación antes de monetizar

- [ ] Alta aprobada en cada programa (**algunos exigen tráfico previo**; empieza por Amazon
      Partners y AliExpress, que aceptan canales nuevos).
- [ ] `AMAZON_ASSOC_TAG` con el sufijo del país correcto (`-21` para España).
- [ ] Comisiones reales volcadas en `merchants` y `comisiones_categoria`.
- [ ] `PUBLIC_BASE_URL` con HTTPS y certificado válido: sin eso los postbacks fallan.
- [ ] `POSTBACK_TOKEN` y `HASH_SALT` generados (`openssl rand -hex 16`).
- [ ] Aviso de afiliación visible en cada mensaje y en la descripción del canal.
- [ ] Comprobado el ciclo completo con una compra real de prueba antes de escalar.
