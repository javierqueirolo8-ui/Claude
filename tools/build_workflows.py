#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de los workflows n8n de ChollosBot ES.

Los JSON de n8n/workflows/ se generan desde aquí: escribir el JavaScript de los
nodos Code dentro de un JSON a mano es frágil (escapes, saltos de línea), así que
la fuente de verdad es este fichero y los JSON son artefactos versionados.

    python3 tools/build_workflows.py

Después se importan con scripts/import-workflows.sh o desde la UI de n8n
(Workflows -> ... -> Import from File).
"""

import json
import pathlib
import uuid

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "n8n" / "workflows"
NS = uuid.UUID("6f1c9a2e-5d3b-4c8a-9e77-2b1f0a4d6c31")

CRED_PG = {"postgres": {"id": "chollosbot-postgres", "name": "Postgres ChollosBot"}}
CRED_ANTHROPIC = {
    "httpHeaderAuth": {"id": "chollosbot-anthropic", "name": "Anthropic API (x-api-key)"}
}
CRED_TG = {"telegramApi": {"id": "chollosbot-telegram", "name": "Telegram ChollosBot"}}


# ---------------------------------------------------------------------------
# Utilidades de construcción
# ---------------------------------------------------------------------------
def nodo(nombre, tipo, tv, pos, params, credenciales=None, **extra):
    n = {
        "parameters": params,
        "id": str(uuid.uuid5(NS, nombre)),
        "name": nombre,
        "type": tipo,
        "typeVersion": tv,
        "position": list(pos),
    }
    if credenciales:
        n["credentials"] = credenciales
    n.update(extra)
    return n


def code(nombre, pos, js, **extra):
    return nodo(nombre, "n8n-nodes-base.code", 2, pos, {"jsCode": js}, **extra)


def pg(nombre, pos, sql, replacement=None, **extra):
    opciones = {}
    if replacement:
        opciones["queryReplacement"] = replacement
    return nodo(
        nombre,
        "n8n-nodes-base.postgres",
        2.5,
        pos,
        {"operation": "executeQuery", "query": sql, "options": opciones},
        CRED_PG,
        **extra,
    )


def http(nombre, pos, params, credenciales=None, **extra):
    return nodo(nombre, "n8n-nodes-base.httpRequest", 4.2, pos, params, credenciales, **extra)


def tg_api(nombre, pos, metodo, cuerpo_expr, **extra):
    """Llamada directa a la Bot API: control total sobre reply_markup."""
    return http(
        nombre,
        pos,
        {
            "method": "POST",
            "url": "=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/" + metodo,
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": cuerpo_expr,
            "options": {"response": {"response": {"neverError": True}}},
        },
        **extra,
    )


def sticky(texto, pos, ancho=460, alto=300, color=7):
    return nodo(
        "Nota " + str(uuid.uuid5(NS, texto))[:8],
        "n8n-nodes-base.stickyNote",
        1,
        pos,
        {"content": texto, "height": alto, "width": ancho, "color": color},
    )


def enlazar(conns, origen, destino, salida=0, entrada=0):
    conns.setdefault(origen, {"main": []})
    main = conns[origen]["main"]
    while len(main) <= salida:
        main.append([])
    main[salida].append({"node": destino, "type": "main", "index": entrada})


def condicion(izq, operacion, der, tipo="string"):
    return {
        "id": str(uuid.uuid5(NS, izq + operacion + str(der))),
        "leftValue": izq,
        "rightValue": der,
        "operator": {"type": tipo, "operation": operacion},
    }


def filtro(condiciones, combinador="and"):
    return {
        "options": {
            "caseSensitive": True,
            "leftValue": "",
            "typeValidation": "loose",
            "version": 2,
        },
        "conditions": condiciones,
        "combinator": combinador,
    }


def nodo_if(nombre, pos, condiciones, combinador="and", **extra):
    return nodo(
        nombre,
        "n8n-nodes-base.if",
        2.2,
        pos,
        {"conditions": filtro(condiciones, combinador), "options": {}},
        **extra,
    )


def nodo_switch(nombre, pos, reglas, fallback="extra"):
    valores = []
    for clave, cond in reglas:
        valores.append(
            {
                "conditions": filtro([cond]),
                "renameOutput": True,
                "outputKey": clave,
            }
        )
    return nodo(
        nombre,
        "n8n-nodes-base.switch",
        3.2,
        pos,
        {"rules": {"values": valores}, "options": {"fallbackOutput": fallback}},
    )


def guardar(wf, fichero):
    SALIDA.mkdir(parents=True, exist_ok=True)
    destino = SALIDA / fichero
    destino.write_text(json.dumps(wf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  ✓ {destino.relative_to(RAIZ)}  ({len(wf['nodes'])} nodos)")


def workflow(nombre, nodos, conexiones, etiquetas):
    return {
        "name": nombre,
        "nodes": nodos,
        "connections": conexiones,
        "active": False,
        "settings": {
            "executionOrder": "v1",
            "saveExecutionProgress": True,
            "saveManualExecutions": True,
            "callerPolicy": "workflowsFromSameOwner",
            "errorWorkflow": "",
        },
        "pinData": {},
        "meta": {"instanceId": "chollosbot-es"},
        "tags": [{"name": t} for t in etiquetas],
    }


# ===========================================================================
# JS COMPARTIDO
# ===========================================================================
JS_UTIL = r"""
// --- utilidades compartidas -------------------------------------------------
const PARAMS_BASURA = ['tag','utm_source','utm_medium','utm_campaign','utm_term',
  'utm_content','ascsubtag','ref','ref_','psc','th','linkCode','smid','pd_rd_i',
  'pd_rd_r','pd_rd_w','pf_rd_p','pf_rd_r','_encoding','gclid','fbclid','clickref',
  'epi','subid','aff_fcid','aff_platform','aff_trace_key'];

function limpiarUrl(u) {
  try {
    const url = new URL(u);
    for (const p of PARAMS_BASURA) url.searchParams.delete(p);
    url.hash = '';
    return url.toString().replace(/\?$/, '');
  } catch (e) { return u; }
}

function dominioDe(u) {
  try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch (e) { return null; }
}

function aNumero(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  // "1.299,99 €" -> 1299.99   |   "1,299.99" -> 1299.99
  let s = String(v).replace(/[^0-9.,-]/g, '').trim();
  if (!s) return null;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function claveProducto(datos) {
  if (datos.asin) return 'asin:' + datos.asin;
  if (datos.ean && String(datos.ean).length >= 8) return 'ean:' + datos.ean;
  const u = limpiarUrl(datos.url_original || '');
  try {
    const url = new URL(u);
    return 'url:' + url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
  } catch (e) { return 'url:' + u; }
}
"""


# ===========================================================================
# WF 01 · INGESTA MULTIFUENTE
# ===========================================================================
def wf_ingesta():
    n, c = [], {}

    n.append(
        sticky(
            "## 1 · Ingesta multifuente\n\n"
            "Recolecta ofertas cada 15 min de cuatro tipos de fuente definidos en la tabla `fuentes`:\n\n"
            "- **amazon_paapi** → Product Advertising API 5.0 firmada con AWS SigV4 (requiere "
            "`NODE_FUNCTION_ALLOW_BUILTIN=crypto`).\n"
            "- **feed_afiliado** → datafeeds de Awin / Tradedoubler / Admitad (JSON).\n"
            "- **rss** → blogs y canales de ofertas.\n"
            "- **html** → páginas con datos estructurados JSON-LD (`schema.org/Product`). "
            "Respeta robots.txt y los términos de cada sitio.\n\n"
            "Todo desemboca en un esquema común, se deduplica por `hash_dedupe` y se guarda "
            "una muestra en `precios_historico`: ese histórico propio es la base de la ventaja "
            "frente a Chollometro.",
            (-620, -180),
            520,
            520,
            4,
        )
    )

    n.append(
        nodo(
            "Cada 15 minutos",
            "n8n-nodes-base.scheduleTrigger",
            1.2,
            (-40, 300),
            {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}},
        )
    )
    n.append(
        pg(
            "Cargar fuentes activas",
            (180, 300),
            "SELECT id, nombre, tipo, url, config, pais, dominio_objetivo\n"
            "FROM fuentes\n"
            "WHERE activo = TRUE\n"
            "ORDER BY prioridad DESC;",
        )
    )
    enlazar(c, "Cada 15 minutos", "Cargar fuentes activas")

    n.append(
        nodo_switch(
            "Rutar por tipo de fuente",
            (400, 300),
            [
                ("amazon", condicion("={{ $json.tipo }}", "equals", "amazon_paapi")),
                ("feed", condicion("={{ $json.tipo }}", "equals", "feed_afiliado")),
                ("rss", condicion("={{ $json.tipo }}", "equals", "rss")),
                ("html", condicion("={{ $json.tipo }}", "equals", "html")),
            ],
            fallback="none",
        )
    )
    enlazar(c, "Cargar fuentes activas", "Rutar por tipo de fuente")

    # --- rama Amazon PA-API ---------------------------------------------------
    n.append(
        code(
            "Firmar petición PA-API (SigV4)",
            (660, -60),
            r"""
// Firma AWS Signature V4 para Product Advertising API 5.0 (SearchItems).
// Requiere en n8n:  NODE_FUNCTION_ALLOW_BUILTIN=crypto
const crypto = require('crypto');
const salida = [];

const hmac = (clave, txt) => crypto.createHmac('sha256', clave).update(txt, 'utf8').digest();
const sha256hex = (txt) => crypto.createHash('sha256').update(txt, 'utf8').digest('hex');

for (const item of $input.all()) {
  const f = item.json;
  const cfg = f.config || {};
  const host = cfg.host || 'webservices.amazon.es';
  const region = cfg.region || 'eu-west-1';
  const servicio = 'ProductAdvertisingAPI';
  const ruta = '/paapi5/searchitems';
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';

  const cuerpo = JSON.stringify({
    Keywords: cfg.keywords || 'ofertas',
    SearchIndex: cfg.searchIndex || 'All',
    ItemCount: cfg.itemCount || 10,
    MinSavingPercent: cfg.minSavingPercent || 20,
    PartnerTag: $env.AMAZON_ASSOC_TAG,
    PartnerType: 'Associates',
    Marketplace: cfg.marketplace || 'www.amazon.es',
    Resources: [
      'ItemInfo.Title', 'ItemInfo.ByLineInfo', 'ItemInfo.Features',
      'ItemInfo.ExternalIds', 'ItemInfo.ProductInfo', 'ItemInfo.Classifications',
      'Images.Primary.Large', 'Offers.Listings.Price', 'Offers.Listings.SavingBasis',
      'Offers.Listings.Promotions', 'Offers.Listings.Availability.Message',
      'Offers.Listings.DeliveryInfo.IsFreeShippingEligible',
      'Offers.Listings.MerchantInfo', 'BrowseNodeInfo.BrowseNodes'
    ]
  });

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dia = amzDate.slice(0, 8);
  const cabeceras = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    'host': host,
    'x-amz-date': amzDate,
    'x-amz-target': target
  };
  const claves = Object.keys(cabeceras).sort();
  const cabecerasFirmadas = claves.join(';');
  const cabecerasCanonicas = claves.map(k => k + ':' + cabeceras[k] + '\n').join('');
  const peticionCanonica = ['POST', ruta, '', cabecerasCanonicas, cabecerasFirmadas,
                            sha256hex(cuerpo)].join('\n');
  const ambito = `${dia}/${region}/${servicio}/aws4_request`;
  const cadenaAFirmar = ['AWS4-HMAC-SHA256', amzDate, ambito, sha256hex(peticionCanonica)].join('\n');

  let k = hmac('AWS4' + $env.AMAZON_PAAPI_SECRET, dia);
  k = hmac(k, region); k = hmac(k, servicio); k = hmac(k, 'aws4_request');
  const firma = crypto.createHmac('sha256', k).update(cadenaAFirmar, 'utf8').digest('hex');

  cabeceras['Authorization'] = `AWS4-HMAC-SHA256 Credential=${$env.AMAZON_PAAPI_KEY}/${ambito}, ` +
                               `SignedHeaders=${cabecerasFirmadas}, Signature=${firma}`;
  delete cabeceras.host; // la pone el cliente HTTP

  salida.push({ json: {
    fuente: f.nombre, dominio_objetivo: f.dominio_objetivo || 'amazon.es', pais: f.pais,
    url: `https://${host}${ruta}`, cabeceras, cuerpo
  }});
}
return salida;
""",
        )
    )
    n.append(
        http(
            "Amazon · SearchItems",
            (880, -60),
            {
                "method": "POST",
                "url": "={{ $json.url }}",
                "sendHeaders": True,
                "specifyHeaders": "json",
                "jsonHeaders": "={{ JSON.stringify($json.cabeceras) }}",
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ $json.cuerpo }}",
                "options": {"response": {"response": {"neverError": True}}},
            },
            onError="continueRegularOutput",
        )
    )
    n.append(
        code(
            "Normalizar Amazon",
            (1100, -60),
            JS_UTIL
            + r"""
const salida = [];
for (const item of $input.all()) {
  const r = item.json || {};
  const ctx = $('Firmar petición PA-API (SigV4)').all()[item.pairedItem?.item ?? 0]?.json || {};
  const articulos = r?.SearchResult?.Items || [];
  for (const a of articulos) {
    const listing = a?.Offers?.Listings?.[0];
    if (!listing) continue;
    const precio = aNumero(listing?.Price?.Amount);
    const anterior = aNumero(listing?.SavingBasis?.Amount);
    if (!precio) continue;
    salida.push({ json: {
      fuente: ctx.fuente || 'amazon_paapi',
      merchant: listing?.MerchantInfo?.Name || 'Amazon',
      url_original: a.DetailPageURL,
      titulo: a?.ItemInfo?.Title?.DisplayValue,
      descripcion: (a?.ItemInfo?.Features?.DisplayValues || []).slice(0, 4).join(' · '),
      imagen: a?.Images?.Primary?.Large?.URL,
      marca: a?.ItemInfo?.ByLineInfo?.Brand?.DisplayValue
             || a?.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue,
      ean: (a?.ItemInfo?.ExternalIds?.EANs?.DisplayValues || [])[0] || null,
      asin: a.ASIN,
      categoria_fuente: a?.BrowseNodeInfo?.BrowseNodes?.[0]?.ContextFreeName || null,
      precio_actual: precio,
      precio_anterior: anterior,
      moneda: listing?.Price?.Currency || 'EUR',
      envio_gratis: !!listing?.DeliveryInfo?.IsFreeShippingEligible,
      envio_coste: 0,
      cupon: (listing?.Promotions || []).map(p => p.DisplayName).filter(Boolean).join(' + ') || null,
      pais: ctx.pais || 'ES',
      stock: !/no disponible|out of stock/i.test(listing?.Availability?.Message || ''),
      payload: { origen: 'paapi5', disponibilidad: listing?.Availability?.Message || null }
    }});
  }
}
return salida;
""",
        )
    )
    enlazar(c, "Rutar por tipo de fuente", "Firmar petición PA-API (SigV4)", salida=0)
    enlazar(c, "Firmar petición PA-API (SigV4)", "Amazon · SearchItems")
    enlazar(c, "Amazon · SearchItems", "Normalizar Amazon")

    # --- rama feed de afiliación ---------------------------------------------
    n.append(
        http(
            "Descargar datafeed",
            (660, 140),
            {
                "method": "GET",
                "url": "={{ $json.url.replace('{AWIN_FEED_KEY}', $env.AWIN_FEED_KEY || '') }}",
                "options": {
                    "timeout": 60000,
                    "response": {"response": {"neverError": True}},
                },
            },
            onError="continueRegularOutput",
        )
    )
    n.append(
        code(
            "Normalizar datafeed",
            (880, 140),
            JS_UTIL
            + r"""
// Aplica el mapeo declarado en fuentes.config.mapeo sobre el datafeed de la red.
const salida = [];
const fuentes = $('Cargar fuentes activas').all().map(i => i.json)
                  .filter(f => f.tipo === 'feed_afiliado');

for (let idx = 0; idx < $input.all().length; idx++) {
  const resp = $input.all()[idx].json;
  const f = fuentes[idx] || fuentes[0] || {};
  const mapeo = (f.config && f.config.mapeo) || {};
  let filas = resp.data || resp.products || resp.body || resp;
  if (!Array.isArray(filas)) filas = filas && Array.isArray(filas.items) ? filas.items : [];

  for (const fila of filas.slice(0, 500)) {
    const precio = aNumero(fila[mapeo.precio || 'search_price']);
    const url = fila[mapeo.url || 'aw_deep_link'];
    if (!precio || !url) continue;
    salida.push({ json: {
      fuente: f.nombre || 'feed_afiliado',
      merchant: f.dominio_objetivo,
      url_original: url,
      titulo: fila[mapeo.titulo || 'product_name'],
      descripcion: (fila[mapeo.descripcion || 'description'] || '').slice(0, 400),
      imagen: fila[mapeo.imagen || 'merchant_image_url'],
      marca: fila[mapeo.marca || 'brand_name'] || null,
      ean: fila[mapeo.ean || 'ean'] || null,
      asin: null,
      categoria_fuente: fila[mapeo.categoria || 'merchant_category'] || null,
      precio_actual: precio,
      precio_anterior: aNumero(fila[mapeo.precio_anterior || 'store_price']),
      moneda: 'EUR',
      envio_gratis: false,
      envio_coste: aNumero(fila.delivery_cost) || 0,
      cupon: null,
      pais: f.pais || 'ES',
      stock: String(fila[mapeo.stock || 'in_stock'] ?? '1') !== '0',
      payload: { origen: 'datafeed' }
    }});
  }
}
return salida;
""",
        )
    )
    enlazar(c, "Rutar por tipo de fuente", "Descargar datafeed", salida=1)
    enlazar(c, "Descargar datafeed", "Normalizar datafeed")

    # --- rama RSS -------------------------------------------------------------
    n.append(
        nodo(
            "Leer RSS",
            "n8n-nodes-base.rssFeedRead",
            1.1,
            (660, 340),
            {"url": "={{ $json.url }}", "options": {"ignoreSSL": False}},
            onError="continueRegularOutput",
        )
    )
    n.append(
        code(
            "Normalizar RSS",
            (880, 340),
            JS_UTIL
            + r"""
// Los feeds de ofertas no traen precio estructurado: se extrae del título/resumen.
const salida = [];
const rePrecio = /(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur|euros)/i;
const reAntes  = /(?:antes|pvp|precio recomendado|en vez de)\D{0,12}(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?)/i;

for (const item of $input.all()) {
  const e = item.json;
  const texto = [e.title, e.contentSnippet, e.content].filter(Boolean).join(' ');
  const m = texto.match(rePrecio);
  if (!m) continue;                                   // sin precio no es una oferta accionable
  const precio = aNumero(m[1]);
  const mAntes = texto.match(reAntes);
  const enlace = e.link || e.guid;
  if (!precio || !enlace) continue;

  const img = (e.enclosure && e.enclosure.url)
    || ((e.content || '').match(/<img[^>]+src="([^"]+)"/i) || [])[1] || null;

  salida.push({ json: {
    fuente: 'rss',
    merchant: dominioDe(enlace),
    url_original: enlace,
    titulo: e.title,
    descripcion: (e.contentSnippet || '').slice(0, 400),
    imagen: img,
    marca: null, ean: null, asin: null,
    categoria_fuente: (e.categories || [])[0] || null,
    precio_actual: precio,
    precio_anterior: mAntes ? aNumero(mAntes[1]) : null,
    moneda: 'EUR',
    envio_gratis: /envío gratis|envio gratis/i.test(texto),
    envio_coste: 0,
    cupon: (texto.match(/c[oó]digo:?\s*([A-Z0-9]{4,15})/i) || [])[1] || null,
    pais: 'ES', stock: true,
    payload: { origen: 'rss', publicado: e.isoDate || e.pubDate || null }
  }});
}
return salida;
""",
        )
    )
    enlazar(c, "Rutar por tipo de fuente", "Leer RSS", salida=2)
    enlazar(c, "Leer RSS", "Normalizar RSS")

    # --- rama HTML / JSON-LD --------------------------------------------------
    n.append(
        http(
            "Descargar página",
            (660, 540),
            {
                "method": "GET",
                "url": "={{ $json.url }}",
                "sendHeaders": True,
                "specifyHeaders": "json",
                "jsonHeaders": '={{ JSON.stringify({ "User-Agent": $env.SCRAPER_USER_AGENT || "ChollosBot/1.0 (+contacto@ejemplo.es)", "Accept-Language": "es-ES,es;q=0.9" }) }}',
                "options": {
                    "timeout": 30000,
                    "response": {"response": {"neverError": True, "responseFormat": "text"}},
                },
            },
            onError="continueRegularOutput",
        )
    )
    n.append(
        code(
            "Normalizar JSON-LD",
            (880, 540),
            JS_UTIL
            + r"""
// Extrae datos estructurados schema.org/Product embebidos en la página.
// No se parsea el DOM ni se saltan protecciones: si la tienda no publica JSON-LD,
// esa fuente simplemente no produce ofertas.
const salida = [];
const fuentes = $('Cargar fuentes activas').all().map(i => i.json).filter(f => f.tipo === 'html');

for (let idx = 0; idx < $input.all().length; idx++) {
  const html = $input.all()[idx].json.data || $input.all()[idx].json.body || '';
  const f = fuentes[idx] || fuentes[0] || {};
  const bloques = [...String(html).matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const b of bloques) {
    let datos; try { datos = JSON.parse(b[1].trim()); } catch (e) { continue; }
    const lista = Array.isArray(datos) ? datos : (datos['@graph'] || [datos]);
    for (const d of lista) {
      if (!d || (d['@type'] !== 'Product' && !(Array.isArray(d['@type']) && d['@type'].includes('Product')))) continue;
      const oferta = Array.isArray(d.offers) ? d.offers[0] : d.offers;
      const precio = aNumero(oferta?.price ?? oferta?.lowPrice);
      if (!precio) continue;
      salida.push({ json: {
        fuente: f.nombre || 'html',
        merchant: dominioDe(oferta?.url || f.url),
        url_original: oferta?.url || d.url || f.url,
        titulo: d.name,
        descripcion: (d.description || '').slice(0, 400),
        imagen: Array.isArray(d.image) ? d.image[0] : d.image,
        marca: typeof d.brand === 'object' ? d.brand?.name : d.brand,
        ean: d.gtin13 || d.gtin || d.gtin8 || null,
        asin: null,
        categoria_fuente: d.category || null,
        precio_actual: precio,
        precio_anterior: aNumero(d.highPrice) || null,
        moneda: oferta?.priceCurrency || 'EUR',
        envio_gratis: false, envio_coste: 0, cupon: null,
        pais: f.pais || 'ES',
        stock: !/OutOfStock|SoldOut/i.test(oferta?.availability || ''),
        payload: { origen: 'json-ld' }
      }});
    }
  }
}
return salida;
""",
        )
    )
    enlazar(c, "Rutar por tipo de fuente", "Descargar página", salida=3)
    enlazar(c, "Descargar página", "Normalizar JSON-LD")

    # --- unificación ----------------------------------------------------------
    n.append(
        nodo(
            "Unificar fuentes",
            "n8n-nodes-base.merge",
            3,
            (1340, 300),
            {"mode": "append", "numberInputs": 4, "options": {}},
        )
    )
    for i, origen in enumerate(
        ["Normalizar Amazon", "Normalizar datafeed", "Normalizar RSS", "Normalizar JSON-LD"]
    ):
        enlazar(c, origen, "Unificar fuentes", entrada=i)

    n.append(
        code(
            "Limpiar, deduplicar y filtrar",
            (1560, 300),
            JS_UTIL
            + r"""
const crypto = require('crypto');

const UMBRALES = { precio_min: 4, precio_max: 4000 };
const TITULO_PROHIBIDO = ['réplica','imitación','curso ganar dinero','criptomoneda','casino',
  'apuestas','seguidores instagram','adelgazar rápido','producto milagro'];
const DOMINIOS_PROHIBIDOS = ['dhgate.com','wish.com','joom.com'];

const vistos = new Set();
const salida = [];

for (const item of $input.all()) {
  const d = { ...item.json };
  if (!d.titulo || !d.url_original || !d.precio_actual) continue;

  d.titulo = String(d.titulo).replace(/\s+/g, ' ').trim().slice(0, 300);
  d.url_original = limpiarUrl(d.url_original);
  d.dominio = dominioDe(d.url_original);
  if (!d.dominio) continue;

  const t = d.titulo.toLowerCase();
  if (DOMINIOS_PROHIBIDOS.includes(d.dominio)) continue;
  if (TITULO_PROHIBIDO.some(p => t.includes(p))) continue;
  if (d.precio_actual < UMBRALES.precio_min || d.precio_actual > UMBRALES.precio_max) continue;
  if (d.stock === false) continue;

  // PVP declarado incoherente (típico inflado x3): se ignora, no se descarta la oferta
  if (d.precio_anterior && d.precio_anterior <= d.precio_actual) d.precio_anterior = null;
  if (d.precio_anterior && d.precio_anterior > d.precio_actual * 5) d.precio_anterior = null;

  d.clave_producto = claveProducto(d);
  d.hash_dedupe = crypto.createHash('sha256')
    .update(d.dominio + '|' + d.clave_producto).digest('hex');
  if (vistos.has(d.hash_dedupe)) continue;   // duplicado dentro del mismo lote
  vistos.add(d.hash_dedupe);

  d.envio_coste = Number(d.envio_coste || 0);
  d.envio_gratis = !!d.envio_gratis;
  d.payload = d.payload || {};
  d.merchant = d.merchant || d.dominio;
  salida.push({ json: d });
}

// Un único item con el lote completo: un solo INSERT atómico en Postgres.
return [{ json: { total: salida.length, lote: salida.map(s => s.json) } }];
""",
        )
    )
    enlazar(c, "Unificar fuentes", "Limpiar, deduplicar y filtrar")

    n.append(
        nodo_if(
            "¿Hay ofertas?",
            (1780, 300),
            [condicion("={{ $json.total }}", "gt", 0, "number")],
        )
    )
    enlazar(c, "Limpiar, deduplicar y filtrar", "¿Hay ofertas?")

    n.append(
        pg(
            "Guardar ofertas e histórico",
            (2000, 220),
            """WITH entrada AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
        hash_dedupe text, clave_producto text, fuente text, merchant text, dominio text,
        url_original text, titulo text, descripcion text, imagen text, marca text,
        ean text, asin text, categoria_fuente text, pais text,
        precio_actual numeric, precio_anterior numeric, moneda text,
        envio_coste numeric, envio_gratis boolean, cupon text, payload jsonb)
), guardadas AS (
    INSERT INTO ofertas (hash_dedupe, clave_producto, fuente, merchant, dominio, url_original,
        titulo, descripcion, imagen, marca, ean, asin, categoria_fuente, pais,
        precio_actual, precio_anterior, moneda, envio_coste, envio_gratis, cupon, payload)
    SELECT hash_dedupe, clave_producto, fuente, merchant, dominio, url_original, titulo,
        descripcion, imagen, marca, ean, asin, categoria_fuente, COALESCE(pais,'ES'),
        precio_actual, precio_anterior, COALESCE(moneda,'EUR'), COALESCE(envio_coste,0),
        COALESCE(envio_gratis,false), cupon, COALESCE(payload,'{}'::jsonb)
    FROM entrada
    ON CONFLICT (hash_dedupe) DO UPDATE SET
        visto_ultima_vez = now(),
        precio_actual    = EXCLUDED.precio_actual,
        precio_anterior  = COALESCE(EXCLUDED.precio_anterior, ofertas.precio_anterior),
        stock            = TRUE,
        -- Una bajada >= 3% sobre lo ya tratado reabre la oferta para reevaluarla
        estado = CASE
            WHEN ofertas.estado IN ('publicada','descartada','caducada')
                 AND EXCLUDED.precio_actual < ofertas.precio_actual * 0.97
            THEN 'nueva' ELSE ofertas.estado END
    RETURNING id, clave_producto, dominio, precio_actual, estado, (xmax = 0) AS es_nueva
), historico AS (
    INSERT INTO precios_historico (clave_producto, dominio, precio, fuente)
    SELECT clave_producto, dominio, precio_actual, 'ingesta' FROM guardadas
    ON CONFLICT DO NOTHING
    RETURNING 1
)
SELECT COUNT(*) FILTER (WHERE es_nueva)                    AS altas,
       COUNT(*) FILTER (WHERE NOT es_nueva)                AS actualizadas,
       COUNT(*) FILTER (WHERE estado = 'nueva')            AS pendientes_clasificar,
       (SELECT COUNT(*) FROM historico)                    AS muestras_precio
FROM guardadas;""",
            replacement="={{ JSON.stringify($json.lote) }}",
        )
    )
    enlazar(c, "¿Hay ofertas?", "Guardar ofertas e histórico", salida=0)

    n.append(
        pg(
            "Marcar fuentes ejecutadas",
            (2220, 220),
            "UPDATE fuentes SET ultima_ejecucion = now(), ultimo_error = NULL\n"
            "WHERE activo = TRUE\n"
            "RETURNING id, nombre, ultima_ejecucion;",
        )
    )
    enlazar(c, "Guardar ofertas e histórico", "Marcar fuentes ejecutadas")

    n.append(
        nodo(
            "Sin novedades",
            "n8n-nodes-base.noOp",
            1,
            (2000, 400),
            {},
        )
    )
    enlazar(c, "¿Hay ofertas?", "Sin novedades", salida=1)

    return workflow(
        "ChollosBot 01 · Ingesta multifuente de ofertas",
        n,
        c,
        ["chollosbot", "ingesta"],
    )


# ===========================================================================
# WF 02 · CLASIFICACIÓN, PRECIO REAL Y SCORING
# ===========================================================================
def wf_clasificacion():
    n, c = [], {}

    n.append(
        sticky(
            "## 2 · Clasificación y scoring\n\n"
            "El corazón del sistema y la principal diferencia frente a un agregador de votos:\n\n"
            "1. **Precio real**: el descuento se calcula contra la mediana propia de 90 días y el "
            "mínimo de 30 días (Directiva Omnibus), no contra el PVP que declara la tienda. Si el "
            "PVP está inflado, se marca `pvp_inflado` y se penaliza.\n"
            "2. **Coste total aterrizado**: precio + envío + recargo de importación − cupón. Una "
            "oferta de Amazon Alemania se compara con la española por coste total real.\n"
            "3. **IA (Claude)**: categoriza en taxonomía cerrada, redacta el copy y detecta riesgos "
            "(vendedor dudoso, dropshipping, falso reacondicionado).\n"
            "4. **Score 0-100** transparente y auditable en `score_detalle`.\n"
            "5. **Enlace monetizado**: deeplink de la red correspondiente con SubID de atribución.\n\n"
            "⚠️ La comisión pesa como máximo 5 puntos sobre 100: nunca decide qué se publica.",
            (-640, -160),
            540,
            560,
            3,
        )
    )

    n.append(
        nodo(
            "Cada 5 minutos",
            "n8n-nodes-base.scheduleTrigger",
            1.2,
            (-40, 260),
            {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}},
        )
    )
    n.append(
        nodo(
            "Llamado desde ingesta",
            "n8n-nodes-base.executeWorkflowTrigger",
            1,
            (-40, 420),
            {"inputSource": "passthrough"},
        )
    )

    n.append(
        pg(
            "Cargar candidatas con histórico",
            (200, 340),
            """WITH candidatas AS (
    SELECT * FROM ofertas
    WHERE estado = 'nueva'
    ORDER BY creada_en ASC
    LIMIT 40
)
SELECT c.id, c.titulo, c.descripcion, c.url_original, c.imagen, c.marca, c.ean, c.asin,
       c.dominio, c.merchant, c.fuente, c.categoria_fuente, c.clave_producto, c.pais,
       c.precio_actual, c.precio_anterior, c.envio_coste, c.envio_gratis, c.cupon, c.moneda,
       m.red                AS red_afiliado,
       m.id_programa,
       m.plantilla_url,
       m.param_subid,
       m.comision_pct       AS comision_base_pct,
       m.fiabilidad,
       m.recargo_import_pct,
       COALESCE(m.envia_a_espana, TRUE) AS envia_a_espana,
       h.precio_min_90d, h.precio_mediana_90d, h.precio_min_30d, h.muestras_90d,
       cat.comision_pct     AS comision_categoria_pct
FROM candidatas c
LEFT JOIN merchants m ON m.dominio = c.dominio
LEFT JOIN comisiones_categoria cat
       ON cat.dominio = c.dominio AND cat.categoria = c.categoria_fuente
LEFT JOIN LATERAL (
    SELECT MIN(p.precio) FILTER (WHERE p.fecha > now() - interval '90 days')  AS precio_min_90d,
           -- percentile_cont solo opera en double precision: se devuelve a
           -- numeric para no arrastrar error de coma flotante en importes.
           (percentile_cont(0.5) WITHIN GROUP (ORDER BY p.precio)
               FILTER (WHERE p.fecha > now() - interval '90 days'))::numeric(12,2)
                                                                          AS precio_mediana_90d,
           MIN(p.precio) FILTER (WHERE p.fecha > now() - interval '30 days')  AS precio_min_30d,
           COUNT(*)      FILTER (WHERE p.fecha > now() - interval '90 days')  AS muestras_90d
    FROM precios_historico p
    WHERE p.clave_producto = c.clave_producto
) h ON TRUE;""",
        )
    )
    enlazar(c, "Cada 5 minutos", "Cargar candidatas con histórico")
    enlazar(c, "Llamado desde ingesta", "Cargar candidatas con histórico")

    n.append(
        code(
            "Precio real y descuento verificado",
            (420, 340),
            r"""
// Ventaja competitiva nº1: el descuento se mide contra nuestro propio histórico.
const UMBRAL_DESCUENTO_REAL = 15;   // %
const MUESTRAS_MINIMAS = 3;
const salida = [];

for (const item of $input.all()) {
  const o = { ...item.json };

  const recargo = Number(o.recargo_import_pct || 0) / 100;
  const cuponDesc = 0;                                  // se resuelve al validar el cupón
  o.precio_total = Number((o.precio_actual * (1 + recargo)
                           + Number(o.envio_coste || 0) - cuponDesc).toFixed(2));

  const mediana = o.precio_mediana_90d ? Number(o.precio_mediana_90d) : null;
  const min30   = o.precio_min_30d     ? Number(o.precio_min_30d)     : null;
  const min90   = o.precio_min_90d     ? Number(o.precio_min_90d)     : null;
  const muestras = Number(o.muestras_90d || 0);
  const pvp = o.precio_anterior ? Number(o.precio_anterior) : null;

  // Referencia honesta: la mediana propia; si aún no hay datos, el PVP de la tienda.
  const referencia = (muestras >= MUESTRAS_MINIMAS && mediana) ? mediana : pvp;
  o.precio_referencia = referencia ? Number(referencia.toFixed(2)) : null;

  o.descuento_pct = pvp ? Number((100 * (1 - o.precio_actual / pvp)).toFixed(2)) : null;
  o.descuento_real_pct = referencia
    ? Number((100 * (1 - o.precio_actual / referencia)).toFixed(2))
    : null;

  // PVP inflado: la tienda anuncia un descuento que el histórico no respalda.
  o.pvp_inflado = !!(pvp && mediana && muestras >= MUESTRAS_MINIMAS && pvp > mediana * 1.25);
  o.precio_min_historico = min90;
  o.es_minimo_historico = !!(min90 && o.precio_actual <= min90 * 1.005);
  // Cumplimiento Omnibus: ¿mejora el mínimo de los últimos 30 días?
  o.mejora_min_30d = !!(min30 && o.precio_actual < min30);
  o.datos_historicos_suficientes = muestras >= MUESTRAS_MINIMAS;

  // --- filtros duros --------------------------------------------------------
  let descartar = null;
  if (o.envia_a_espana === false) descartar = 'no_envia_a_espana';
  else if (!o.plantilla_url) descartar = 'comercio_sin_programa_afiliacion';
  else if (o.descuento_real_pct !== null && o.descuento_real_pct < UMBRAL_DESCUENTO_REAL)
    descartar = `descuento_real_insuficiente_${o.descuento_real_pct}%`;
  else if (o.descuento_real_pct === null && !pvp)
    descartar = 'sin_referencia_de_precio';
  else if (mediana && o.precio_actual > mediana) descartar = 'precio_por_encima_de_la_mediana';

  o.descartar = descartar;
  salida.push({ json: o });
}
return salida;
""",
        )
    )
    enlazar(c, "Cargar candidatas con histórico", "Precio real y descuento verificado")

    n.append(
        nodo_if(
            "¿Supera filtros de precio?",
            (640, 340),
            [condicion("={{ $json.descartar }}", "empty", "")],
        )
    )
    enlazar(c, "Precio real y descuento verificado", "¿Supera filtros de precio?")

    n.append(
        pg(
            "Descartar oferta",
            (860, 520),
            "UPDATE ofertas SET estado = 'descartada', motivo_descarte = $2,\n"
            "       descuento_real_pct = $3, precio_referencia = $4\n"
            "WHERE id = $1\n"
            "RETURNING id, motivo_descarte;",
            replacement="={{ [$json.id, $json.descartar, $json.descuento_real_pct, $json.precio_referencia] }}",
        )
    )
    enlazar(c, "¿Supera filtros de precio?", "Descartar oferta", salida=1)

    n.append(
        code(
            "Construir prompt de clasificación",
            (860, 260),
            r"""
const CATEGORIAS = ['informatica','electronica','movil','videojuegos','hogar',
  'electrodomesticos','moda','deporte','belleza','alimentacion','juguetes','jardin',
  'motor','libros','viajes','servicios','otros'];

const salida = [];
for (const item of $input.all()) {
  const o = item.json;
  const ficha = {
    titulo: o.titulo,
    descripcion: (o.descripcion || '').slice(0, 600),
    marca: o.marca,
    comercio: o.merchant,
    dominio: o.dominio,
    categoria_declarada: o.categoria_fuente,
    precio_actual: o.precio_actual,
    precio_total_con_envio: o.precio_total,
    pvp_declarado_tienda: o.precio_anterior,
    precio_referencia_historico_90d: o.precio_referencia,
    minimo_historico: o.precio_min_historico,
    descuento_declarado_pct: o.descuento_pct,
    descuento_real_pct: o.descuento_real_pct,
    pvp_inflado_detectado: o.pvp_inflado,
    es_minimo_historico: o.es_minimo_historico,
    muestras_historicas: o.muestras_90d,
    pais_tienda: o.pais
  };

  const sistema = [
    'Eres un analista de ofertas de comercio electrónico en España.',
    'Evalúas si una oferta merece publicarse en un canal de chollos y redactas el aviso.',
    'Eres escéptico: los descuentos inflados, los reacondicionados mal etiquetados y los',
    'vendedores de marketplace sin reputación son señales de alarma.',
    'Escribes en español de España, tono directo, sin superlativos publicitarios ni urgencia falsa.',
    'Respondes ÚNICAMENTE con un objeto JSON válido, sin texto alrededor ni bloques de código.'
  ].join(' ');

  const usuario = [
    'Analiza esta oferta y devuelve este JSON exacto:',
    '{',
    '  "categoria": "<una de: ' + CATEGORIAS.join('|') + '>",',
    '  "subcategoria": "<texto corto>",',
    '  "marca": "<marca detectada o null>",',
    '  "titulo_limpio": "<título legible, máx 80 caracteres, sin mayúsculas gritadas ni relleno SEO>",',
    '  "copy": "<2 frases explicando por qué interesa o por qué no. Sin emojis. Máx 240 caracteres>",',
    '  "hashtags": ["<3 hashtags en minúscula sin #>"],',
    '  "calidad": <0-100: relación calidad/precio del producto en sí>,',
    '  "interes": <0-100: cuánta gente en España buscaría esto>,',
    '  "riesgos": ["<lista de riesgos detectados o vacía>"],',
    '  "veredicto": "<chollo|buena|normal|dudosa>",',
    '  "publicable": <true|false>',
    '}',
    '',
    'Ficha de la oferta:',
    JSON.stringify(ficha, null, 2)
  ].join('\n');

  salida.push({ json: {
    ...o,
    peticion_ia: {
      model: $env.MODELO_IA || 'claude-sonnet-5',
      max_tokens: 900,
      temperature: 0.2,
      system: sistema,
      messages: [{ role: 'user', content: usuario }]
    }
  }});
}
return salida;
""",
        )
    )
    enlazar(c, "¿Supera filtros de precio?", "Construir prompt de clasificación", salida=0)

    n.append(
        http(
            "Claude · clasificar oferta",
            (1080, 260),
            {
                "method": "POST",
                "url": "https://api.anthropic.com/v1/messages",
                "authentication": "genericCredentialType",
                "genericAuthType": "httpHeaderAuth",
                "sendHeaders": True,
                "specifyHeaders": "json",
                "jsonHeaders": '={{ JSON.stringify({ "anthropic-version": "2023-06-01", "content-type": "application/json" }) }}',
                "sendBody": True,
                "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json.peticion_ia) }}",
                "options": {
                    "batching": {"batch": {"batchSize": 5, "batchInterval": 1200}},
                    "timeout": 60000,
                    "response": {"response": {"neverError": True}},
                },
            },
            CRED_ANTHROPIC,
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Construir prompt de clasificación", "Claude · clasificar oferta")

    n.append(
        code(
            "Score, enlace afiliado y copy",
            (1300, 260),
            r"""
// Score 0-100 auditable. Cada componente queda registrado en score_detalle
// para poder explicar por qué se publicó (o no) cualquier oferta.
const entradas = $('Construir prompt de clasificación').all().map(i => i.json);
const salida = [];
const respuestas = $input.all();

const nonce = () => Math.random().toString(36).slice(2, 8);
const cap = (v, min, max) => Math.max(min, Math.min(max, v));

for (let i = 0; i < respuestas.length; i++) {
  const o = { ...(entradas[i] || {}) };
  if (!o.id) continue;

  // --- respuesta de la IA (tolerante a fallos: si falla, se sigue con reglas) --
  let ia = {};
  try {
    const txt = respuestas[i].json?.content?.[0]?.text || '{}';
    ia = JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim());
  } catch (e) { ia = { categoria: 'otros', calidad: 50, interes: 50, veredicto: 'normal',
                       publicable: true, riesgos: ['clasificacion_ia_no_disponible'] }; }

  const categoria = ia.categoria || 'otros';
  const descuento = Number(o.descuento_real_pct || 0);

  // --- componentes del score ------------------------------------------------
  const sDescuento  = cap(Math.round(descuento * 0.9), 0, 35);              // 0-35
  const sMinimo     = o.es_minimo_historico ? 20 : (o.mejora_min_30d ? 12 : 0); // 0-20
  const sComercio   = Math.round(cap(Number(o.fiabilidad ?? 70), 0, 100) * 0.15); // 0-15
  const sCalidad    = Math.round(cap(Number(ia.calidad ?? 50), 0, 100) * 0.15);   // 0-15
  const sInteres    = Math.round(cap(Number(ia.interes ?? 50), 0, 100) * 0.10);   // 0-10

  let penalizacion = 0;
  const riesgos = Array.isArray(ia.riesgos) ? ia.riesgos : [];
  penalizacion += riesgos.length * 4;
  if (o.pvp_inflado) penalizacion += 10;
  if (!o.datos_historicos_suficientes) penalizacion += 6;   // aún no lo podemos verificar
  if (ia.veredicto === 'dudosa') penalizacion += 12;
  penalizacion = cap(penalizacion, 0, 30);

  // --- comisión: desempate, nunca criterio principal (máx +5) ---------------
  const comisionPct = Number(o.comision_categoria_pct ?? o.comision_base_pct ?? 0);
  const sComision = cap(Math.round(comisionPct / 2), 0, 5);

  const score = cap(sDescuento + sMinimo + sComercio + sCalidad + sInteres
                    + sComision - penalizacion, 0, 100);

  // --- enlace monetizado con SubID de atribución ----------------------------
  const subid = `o${o.id}-c${(o.canal || 'general')}-${nonce()}`;
  const idAfiliado = {
    amazon: $env.AMAZON_ASSOC_TAG, awin: $env.AWIN_AFF_ID,
    tradedoubler: $env.TRADEDOUBLER_AFF_ID, admitad: $env.ADMITAD_AFF_ID,
    aliexpress: $env.ALIEXPRESS_TRACKING_ID, epn: $env.EPN_CAMPAIGN_ID,
    impact: $env.IMPACT_AFF_ID
  }[o.red_afiliado] || $env.AFF_ID_DIRECTO || '';

  const urlAfiliado = String(o.plantilla_url || '{URL}')
    .replace('{URL_ENC}', encodeURIComponent(o.url_original))
    .replace('{URL}', o.url_original)
    .replace('{AFF_ID}', idAfiliado)
    .replace('{PROGRAMA}', o.id_programa || '')
    .replace('{SUBID}', subid);

  const base = ($env.PUBLIC_BASE_URL || 'https://n8n.example.com').replace(/\/$/, '');

  salida.push({ json: {
    id: o.id,
    categoria,
    subcategoria: ia.subcategoria || null,
    marca: ia.marca || o.marca || null,
    titulo_limpio: (ia.titulo_limpio || o.titulo).slice(0, 120),
    copy: ia.copy || '',
    hashtags: (ia.hashtags || []).slice(0, 3).map(h => String(h).replace(/^#/, '')),
    veredicto_ia: ia.veredicto || 'normal',
    riesgos,
    score,
    score_detalle: {
      descuento: sDescuento, minimo_historico: sMinimo, fiabilidad_comercio: sComercio,
      calidad_ia: sCalidad, interes_ia: sInteres, comision: sComision,
      penalizacion: -penalizacion, total: score,
      formula: 'descuento(35) + minimo(20) + comercio(15) + calidad(15) + interes(10) + comision(5) - penalizacion(30)'
    },
    precio_referencia: o.precio_referencia,
    precio_min_historico: o.precio_min_historico,
    precio_min_30d: o.precio_min_30d,
    precio_total: o.precio_total,
    descuento_pct: o.descuento_pct,
    descuento_real_pct: o.descuento_real_pct,
    es_minimo_historico: o.es_minimo_historico,
    pvp_inflado: o.pvp_inflado,
    url_afiliado: urlAfiliado,
    url_corta: `${base}/webhook/r/${o.id}`,
    red_afiliado: o.red_afiliado,
    comision_pct: comisionPct,
    comision_estimada: Number((o.precio_actual * comisionPct / 100).toFixed(2)),
    // La IA puede vetar, pero el score decide: nunca publicamos algo que la IA marca como no publicable
    estado: (ia.publicable === false) ? 'descartada' : 'clasificada',
    motivo_descarte: (ia.publicable === false) ? ('ia:' + (riesgos.join(',') || 'no_publicable')) : null,
    caduca_en: new Date(Date.now() + 72 * 3600 * 1000).toISOString()
  }});
}
return salida;
""",
        )
    )
    enlazar(c, "Claude · clasificar oferta", "Score, enlace afiliado y copy")

    n.append(
        pg(
            "Guardar clasificación",
            (1520, 260),
            """UPDATE ofertas SET
    categoria            = $2,
    subcategoria         = $3,
    marca                = COALESCE($4, marca),
    titulo_limpio        = $5,
    descripcion          = COALESCE($6, descripcion),
    hashtags             = $7::text[],
    veredicto_ia         = $8,
    riesgos              = $9::text[],
    score                = $10,
    score_detalle        = $11::jsonb,
    precio_referencia    = $12,
    precio_min_historico = $13,
    precio_min_30d       = $14,
    precio_total         = $15,
    descuento_pct        = $16,
    descuento_real_pct   = $17,
    es_minimo_historico  = $18,
    pvp_inflado          = $19,
    url_afiliado         = $20,
    url_corta            = $21,
    red_afiliado         = $22,
    comision_pct         = $23,
    comision_estimada    = $24,
    estado               = $25,
    motivo_descarte      = $26,
    caduca_en            = $27::timestamptz
WHERE id = $1
RETURNING id, titulo_limpio, categoria, score, estado, comision_estimada;""",
            replacement=(
                "={{ [$json.id, $json.categoria, $json.subcategoria, $json.marca, "
                "$json.titulo_limpio, $json.copy, '{' + $json.hashtags.join(',') + '}', "
                "$json.veredicto_ia, '{' + $json.riesgos.map(r => JSON.stringify(String(r))).join(',') + '}', "
                "$json.score, JSON.stringify($json.score_detalle), $json.precio_referencia, "
                "$json.precio_min_historico, $json.precio_min_30d, $json.precio_total, "
                "$json.descuento_pct, $json.descuento_real_pct, $json.es_minimo_historico, "
                "$json.pvp_inflado, $json.url_afiliado, $json.url_corta, $json.red_afiliado, "
                "$json.comision_pct, $json.comision_estimada, $json.estado, "
                "$json.motivo_descarte, $json.caduca_en] }}"
            ),
        )
    )
    enlazar(c, "Score, enlace afiliado y copy", "Guardar clasificación")

    return workflow(
        "ChollosBot 02 · Clasificación, precio real y scoring",
        n,
        c,
        ["chollosbot", "ia", "scoring"],
    )


# ===========================================================================
# WF 03 · PUBLICACIÓN AUTOMÁTICA + ALERTAS PERSONALIZADAS
# ===========================================================================
def wf_publicacion():
    n, c = [], {}

    n.append(
        sticky(
            "## 3 · Difusión automática\n\n"
            "Publica en el canal correspondiente y, en paralelo, avisa por privado a quienes "
            "tengan una alerta que encaje.\n\n"
            "**Control de ruido** (otra diferencia frente a un muro comunitario):\n"
            "- máximo configurable de publicaciones por hora,\n"
            "- máximo 2 ofertas por categoría en cada ronda,\n"
            "- ningún comercio se repite en 20 minutos,\n"
            "- espera entre envíos para no chocar con los límites de la Bot API.\n\n"
            "Cada mensaje incluye ficha de precio verificado, aviso de afiliación y botones de "
            "compra, histórico y alerta de bajada.",
            (-640, -140),
            520,
            460,
            5,
        )
    )

    n.append(
        nodo(
            "Cada 10 minutos",
            "n8n-nodes-base.scheduleTrigger",
            1.2,
            (-60, 300),
            {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}},
        )
    )
    n.append(
        pg(
            "Cargar canales",
            (160, 300),
            "SELECT nombre, chat_id, categorias, score_minimo, max_por_hora\n"
            "FROM canales WHERE activo = TRUE ORDER BY array_length(categorias, 1) DESC NULLS LAST;",
        )
    )
    enlazar(c, "Cada 10 minutos", "Cargar canales")

    n.append(
        code(
            "Agrupar canales",
            (380, 300),
            r"""
// Un único item con la configuración de canales: evita multiplicar las consultas siguientes.
const canales = $input.all().map(i => i.json);
return [{ json: {
  canales,
  general: canales.find(c => !c.categorias || c.categorias.length === 0) || canales[0] || null,
  admin: canales.find(c => (c.nombre || '').toLowerCase() === 'admin') || null
}}];
""",
        )
    )
    enlazar(c, "Cargar canales", "Agrupar canales")

    n.append(
        pg(
            "Seleccionar ofertas a publicar",
            (600, 300),
            """WITH cupo AS (
    SELECT COUNT(*) AS publicadas_ultima_hora
    FROM ofertas
    WHERE estado = 'publicada' AND publicada_en > now() - interval '1 hour'
), ordenadas AS (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY o.categoria ORDER BY o.score DESC) AS rn
    FROM ofertas o
    WHERE o.estado = 'clasificada'
      AND o.score >= COALESCE(NULLIF(current_setting('chollosbot.score_min', true), '')::int, 60)
      AND o.stock = TRUE
      AND (o.caduca_en IS NULL OR o.caduca_en > now())
      AND o.url_afiliado IS NOT NULL
)
SELECT o.id, o.titulo, o.titulo_limpio, o.descripcion, o.imagen, o.marca, o.categoria,
       o.subcategoria, o.hashtags, o.merchant, o.dominio, o.url_afiliado, o.url_corta,
       o.precio_actual, o.precio_total, o.precio_anterior, o.precio_referencia,
       o.precio_min_historico, o.precio_min_30d, o.envio_gratis, o.envio_coste, o.cupon,
       o.descuento_pct, o.descuento_real_pct, o.es_minimo_historico, o.pvp_inflado,
       o.score, o.veredicto_ia, o.riesgos, o.comision_pct, o.comision_estimada, o.moneda
FROM ordenadas o, cupo
WHERE o.rn <= 2
  AND cupo.publicadas_ultima_hora < COALESCE(NULLIF(current_setting('chollosbot.max_hora', true), '')::int, 12)
  AND NOT EXISTS (
      SELECT 1 FROM ofertas o2
      WHERE o2.dominio = o.dominio AND o2.estado = 'publicada'
        AND o2.publicada_en > now() - interval '20 minutes')
ORDER BY o.score DESC
LIMIT LEAST(5, GREATEST(0, 12 - (SELECT publicadas_ultima_hora FROM cupo)));""",
        )
    )
    enlazar(c, "Agrupar canales", "Seleccionar ofertas a publicar")

    n.append(
        code(
            "Componer mensaje de Telegram",
            (820, 300),
            r"""
const cfg = $('Agrupar canales').first().json;
const EMOJI = { informatica:'💻', electronica:'🔌', movil:'📱', videojuegos:'🎮', hogar:'🏠',
  electrodomesticos:'🧊', moda:'👕', deporte:'🏃', belleza:'💄', alimentacion:'🛒',
  juguetes:'🧸', jardin:'🌿', motor:'🚗', libros:'📚', viajes:'✈️', servicios:'🧾', otros:'🎁' };

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const eur = (v) => v === null || v === undefined ? '—'
  : Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const salida = [];
for (const item of $input.all()) {
  const o = item.json;

  // Canal temático si existe; si no, el general.
  const canal = cfg.canales.find(c => (c.categorias || []).includes(o.categoria)
                                      && o.score >= c.score_minimo)
             || cfg.general;
  if (!canal) continue;

  const emoji = EMOJI[o.categoria] || '🎁';
  const lineas = [];

  const insignias = [];
  if (o.es_minimo_historico) insignias.push('🏆 <b>MÍNIMO HISTÓRICO</b>');
  if (o.score >= 85) insignias.push('🔥 <b>CHOLLO TOP</b>');
  if (o.pvp_inflado) insignias.push('⚠️ <i>PVP de tienda inflado: descuento real calculado sobre histórico</i>');
  if (insignias.length) lineas.push(insignias.join('  '));

  lineas.push(`${emoji} <b>${esc(o.titulo_limpio || o.titulo)}</b>`);
  lineas.push('');
  lineas.push(`💶 <b>${eur(o.precio_actual)}</b>` +
    (o.descuento_real_pct ? `  <s>${eur(o.precio_referencia)}</s>  <b>−${Math.round(o.descuento_real_pct)}%</b>` : ''));

  const detalles = [];
  if (o.envio_gratis) detalles.push('📦 Envío gratis');
  else if (Number(o.envio_coste) > 0) detalles.push(`📦 +${eur(o.envio_coste)} envío`);
  if (o.cupon) detalles.push(`🏷 Cupón <code>${esc(o.cupon)}</code>`);
  if (o.precio_total && Number(o.precio_total) !== Number(o.precio_actual))
    detalles.push(`🧮 Total real ${eur(o.precio_total)}`);
  if (detalles.length) lineas.push(detalles.join('   '));

  // Ficha de precio verificado: lo que un muro de votos no puede ofrecer
  const ficha = [];
  if (o.precio_min_historico) ficha.push(`mínimo 90d ${eur(o.precio_min_historico)}`);
  if (o.precio_min_30d) ficha.push(`mínimo 30d ${eur(o.precio_min_30d)}`);
  if (o.precio_referencia) ficha.push(`precio habitual ${eur(o.precio_referencia)}`);
  if (ficha.length) lineas.push(`📊 <i>${ficha.join(' · ')}</i>`);

  if (o.descripcion) { lineas.push(''); lineas.push(esc(String(o.descripcion).slice(0, 240))); }

  if (o.riesgos && o.riesgos.length) {
    lineas.push('');
    lineas.push('⚠️ <i>A tener en cuenta: ' + esc(o.riesgos.join(', ')) + '</i>');
  }

  lineas.push('');
  lineas.push(`🏬 ${esc(o.merchant || o.dominio)}   ·   ⭐ Índice de chollo ${o.score}/100`);
  const tags = (o.hashtags || []).map(h => '#' + String(h).replace(/[^\p{L}\p{N}_]/gu, '')).join(' ');
  if (tags) lineas.push(tags);
  lineas.push('');
  lineas.push('<i>🔗 Enlace de afiliado: si compras, el canal cobra una comisión sin coste extra para ti.</i>');

  const teclado = { inline_keyboard: [
    [{ text: `🛒 Ver oferta · ${eur(o.precio_actual)}`, url: o.url_corta }],
    [{ text: '📉 Histórico de precio', callback_data: `hist:${o.id}` },
     { text: '🔔 Avísame si baja',     callback_data: `alerta:${o.id}` }]
  ]};

  salida.push({ json: {
    ...o,
    chat_id: canal.chat_id,
    canal_nombre: canal.nombre,
    mensaje: lineas.join('\n').slice(0, 1024),
    teclado
  }});
}
return salida;
""",
        )
    )
    enlazar(c, "Seleccionar ofertas a publicar", "Componer mensaje de Telegram")

    n.append(
        nodo(
            "Recorrer ofertas",
            "n8n-nodes-base.splitInBatches",
            3,
            (1040, 300),
            {"batchSize": 1, "options": {"reset": False}},
        )
    )
    enlazar(c, "Componer mensaje de Telegram", "Recorrer ofertas")

    n.append(
        tg_api(
            "Publicar en el canal",
            (1300, 380),
            "sendPhoto",
            "={{ JSON.stringify({ chat_id: $json.chat_id, photo: $json.imagen || 'https://dummyimage.com/900x600/1f2937/ffffff&text=Oferta', caption: $json.mensaje, parse_mode: 'HTML', reply_markup: $json.teclado }) }}",
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Recorrer ofertas", "Publicar en el canal", salida=1)

    n.append(
        pg(
            "Marcar como publicada",
            (1520, 380),
            """WITH marcada AS (
    UPDATE ofertas SET estado = 'publicada', publicada_en = now(),
        canal_chat_id = $2, telegram_message_id = $3
    WHERE id = $1
    RETURNING id, titulo_limpio, categoria, precio_actual, url_corta, comision_estimada
), registro AS (
    INSERT INTO publicaciones (oferta_id, canal_chat_id, message_id, tipo)
    SELECT id, $2, $3, 'canal' FROM marcada
    RETURNING oferta_id
)
SELECT m.*, $4::text AS chat_id FROM marcada m;""",
            replacement=(
                "={{ [ $('Recorrer ofertas').item.json.id, "
                "$('Recorrer ofertas').item.json.chat_id, "
                "($json.result && $json.result.message_id) || null, "
                "$('Recorrer ofertas').item.json.chat_id ] }}"
            ),
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Publicar en el canal", "Marcar como publicada")

    n.append(
        nodo(
            "Esperar 3 s (anti-flood)",
            "n8n-nodes-base.wait",
            1.1,
            (1740, 300),
            {"amount": 3, "unit": "seconds"},
            webhookId=str(uuid.uuid5(NS, "wait-publicacion")),
        )
    )
    enlazar(c, "Marcar como publicada", "Esperar 3 s (anti-flood)")
    enlazar(c, "Esperar 3 s (anti-flood)", "Recorrer ofertas")

    # --- rama de alertas personalizadas ---------------------------------------
    n.append(
        pg(
            "Buscar alertas coincidentes",
            (1520, 560),
            """SELECT a.id            AS alerta_id,
       s.chat_id,
       s.telegram_user_id,
       a.texto,
       a.precio_max
FROM alertas a
JOIN suscriptores s ON s.id = a.suscriptor_id
WHERE a.activa AND s.activo
  AND (
        (a.texto IS NOT NULL AND unaccent(lower($2)) LIKE '%' || unaccent(lower(a.texto)) || '%')
     OR (a.categoria IS NOT NULL AND a.categoria = $3)
      )
  AND $4::numeric <= COALESCE(a.precio_max, 999999)
  AND COALESCE(a.descuento_min, 0) <= COALESCE($5::numeric, 0)
  AND NOT EXISTS (SELECT 1 FROM envios_alerta e
                  WHERE e.alerta_id = a.id AND e.oferta_id = $1)
LIMIT 200;""",
            replacement=(
                "={{ [ $('Recorrer ofertas').item.json.id, "
                "$('Recorrer ofertas').item.json.titulo, "
                "$('Recorrer ofertas').item.json.categoria, "
                "$('Recorrer ofertas').item.json.precio_actual, "
                "$('Recorrer ofertas').item.json.descuento_real_pct ] }}"
            ),
            alwaysOutputData=False,
        )
    )
    enlazar(c, "Marcar como publicada", "Buscar alertas coincidentes")

    n.append(
        code(
            "Preparar avisos privados",
            (1740, 560),
            r"""
const o = $('Recorrer ofertas').first().json;
const eur = (v) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
const salida = [];

for (const item of $input.all()) {
  const a = item.json;
  if (!a.chat_id) continue;
  const motivo = a.texto ? `tu alerta «${a.texto}»` : 'una categoría que sigues';
  salida.push({ json: {
    alerta_id: a.alerta_id,
    oferta_id: o.id,
    cuerpo: {
      chat_id: a.chat_id,
      text: `🔔 Coincide con ${motivo}\n\n<b>${o.titulo_limpio || o.titulo}</b>\n` +
            `💶 <b>${eur(o.precio_actual)}</b>` +
            (o.descuento_real_pct ? ` (−${Math.round(o.descuento_real_pct)}% real)` : '') +
            `\n🏬 ${o.merchant || o.dominio}\n\n` +
            `<i>🔗 Enlace de afiliado.</i>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🛒 Ver oferta', url: o.url_corta }]] }
    }
  }});
}
return salida;
""",
        )
    )
    enlazar(c, "Buscar alertas coincidentes", "Preparar avisos privados")

    n.append(
        tg_api(
            "Enviar aviso privado",
            (1960, 560),
            "sendMessage",
            "={{ JSON.stringify($json.cuerpo) }}",
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Preparar avisos privados", "Enviar aviso privado")

    n.append(
        pg(
            "Registrar envío de alerta",
            (2180, 560),
            "INSERT INTO envios_alerta (alerta_id, oferta_id) VALUES ($1, $2)\n"
            "ON CONFLICT DO NOTHING RETURNING alerta_id;",
            replacement="={{ [ $('Preparar avisos privados').item.json.alerta_id, $('Preparar avisos privados').item.json.oferta_id ] }}",
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Enviar aviso privado", "Registrar envío de alerta")

    n.append(nodo("Ronda completada", "n8n-nodes-base.noOp", 1, (1300, 180), {}))
    enlazar(c, "Recorrer ofertas", "Ronda completada", salida=0)

    return workflow(
        "ChollosBot 03 · Publicación automática y alertas",
        n,
        c,
        ["chollosbot", "telegram", "difusion"],
    )


# ===========================================================================
# WF 04 · BOT DE TELEGRAM (COMANDOS)
# ===========================================================================
def wf_bot():
    n, c = [], {}

    n.append(
        sticky(
            "## 4 · Bot conversacional\n\n"
            "El canal difunde; el bot convierte a cada usuario en un filtro propio.\n\n"
            "`/start` · `/ayuda` · `/categorias` · `/alerta <texto> [precio]` · `/misalertas` · "
            "`/borrar <id>` · `/top` · `/buscar <texto>` · `/baja`\n\n"
            "Botones: **📉 Histórico de precio** dibuja la curva real de los últimos 90 días y "
            "**🔔 Avísame si baja** crea la alerta desde el propio mensaje.\n\n"
            "Todas las ramas terminan en un único nodo de respuesta.",
            (-660, -140),
            520,
            400,
            6,
        )
    )

    n.append(
        nodo(
            "Telegram · actualizaciones",
            "n8n-nodes-base.telegramTrigger",
            1.2,
            (-80, 320),
            {"updates": ["message", "callback_query"], "additionalFields": {}},
            CRED_TG,
            webhookId=str(uuid.uuid5(NS, "wh-bot")),
        )
    )

    n.append(
        code(
            "Interpretar mensaje",
            (160, 320),
            r"""
const salida = [];
for (const item of $input.all()) {
  const u = item.json;
  const cb = u.callback_query;
  const msg = cb ? cb.message : (u.message || u.edited_message);
  if (!msg) continue;

  const from = cb ? cb.from : msg.from;
  const base = {
    chat_id: String(msg.chat.id),
    user_id: from.id,
    nombre: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'amigo',
    username: from.username || null,
    callback_query_id: cb ? cb.id : null
  };

  if (cb) {
    const [accion, valor] = String(cb.data || '').split(':');
    salida.push({ json: { ...base, comando: accion === 'hist' ? 'historial' : 'alerta_boton',
                          argumento: valor, oferta_id: parseInt(valor, 10) || null } });
    continue;
  }

  const texto = (msg.text || '').trim();
  const m = texto.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  let comando = m ? m[1].toLowerCase() : 'buscar';
  let argumento = m ? (m[2] || '').trim() : texto;

  // /alerta portátil 500  ->  texto="portátil", precio_max=500
  let precio_max = null;
  if (comando === 'alerta') {
    const p = argumento.match(/(?:^|\s)(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur)?\s*$/i);
    if (p) { precio_max = parseFloat(p[1].replace(',', '.')); argumento = argumento.slice(0, p.index).trim(); }
  }
  if (!texto.startsWith('/') && texto.length < 2) comando = 'ayuda';

  salida.push({ json: { ...base, comando, argumento, precio_max, texto } });
}
return salida;
""",
        )
    )
    enlazar(c, "Telegram · actualizaciones", "Interpretar mensaje")

    salidas = [
        ("start", "start"),
        ("alerta", "alerta"),
        ("alerta_boton", "alerta_boton"),
        ("misalertas", "misalertas"),
        ("borrar", "borrar"),
        ("top", "top"),
        ("buscar", "buscar"),
        ("historial", "historial"),
        ("categorias", "categorias"),
        ("baja", "baja"),
    ]
    n.append(
        nodo_switch(
            "Enrutar comando",
            (400, 320),
            [(k, condicion("={{ $json.comando }}", "equals", v)) for k, v in salidas],
            fallback="extra",
        )
    )
    enlazar(c, "Interpretar mensaje", "Enrutar comando")

    y = -180
    paso = 120

    # /start
    n.append(
        pg(
            "Alta de suscriptor",
            (700, y),
            """INSERT INTO suscriptores (telegram_user_id, chat_id, nombre)
VALUES ($1, $2, $3)
ON CONFLICT (telegram_user_id) DO UPDATE
    SET activo = TRUE, chat_id = EXCLUDED.chat_id, nombre = EXCLUDED.nombre
RETURNING id, nombre, chat_id;""",
            replacement="={{ [$json.user_id, $json.chat_id, $json.nombre] }}",
        )
    )
    n.append(
        code(
            "Texto de bienvenida",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const texto = [
  `👋 Hola ${ctx.nombre}, te has suscrito a <b>ChollosBot</b>.`,
  '',
  'No soy un muro de ofertas votadas: <b>verifico cada precio contra su histórico real</b>',
  'de 90 días antes de publicarlo, así que un “−70%” inventado no llega hasta ti.',
  '',
  '<b>Qué puedo hacer</b>',
  '🔔 <code>/alerta portátil 600</code> — te aviso cuando aparezca algo que encaje',
  '📋 <code>/misalertas</code> — ver y gestionar tus alertas',
  '🗑 <code>/borrar 3</code> — eliminar una alerta',
  '🔥 <code>/top</code> — los mejores chollos verificados de las últimas 24 h',
  '🔎 <code>/buscar auriculares</code> — buscar en lo publicado',
  '🗂 <code>/categorias</code> — categorías disponibles',
  '🚪 <code>/baja</code> — dejar de recibir avisos',
  '',
  '<i>🔗 Uso enlaces de afiliado: si compras a través de ellos, recibo una comisión sin coste',
  'adicional para ti. Es lo que paga el mantenimiento del bot.</i>'
].join('\n');
return [{ json: { chat_id: ctx.chat_id, texto } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Alta de suscriptor", salida=0)
    enlazar(c, "Alta de suscriptor", "Texto de bienvenida")

    # /alerta
    y += paso * 2
    n.append(
        pg(
            "Crear alerta",
            (700, y),
            """WITH s AS (
    INSERT INTO suscriptores (telegram_user_id, chat_id, nombre)
    VALUES ($1, $2, $3)
    ON CONFLICT (telegram_user_id) DO UPDATE SET activo = TRUE, chat_id = EXCLUDED.chat_id
    RETURNING id
)
INSERT INTO alertas (suscriptor_id, texto, precio_max)
SELECT s.id, NULLIF($4, ''), $5::numeric FROM s
RETURNING id, texto, precio_max;""",
            replacement="={{ [$json.user_id, $json.chat_id, $json.nombre, $json.argumento, $json.precio_max] }}",
        )
    )
    n.append(
        code(
            "Confirmar alerta",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const a = $input.first().json;
if (!a || !a.texto) {
  return [{ json: { chat_id: ctx.chat_id,
    texto: 'Necesito qué buscar. Ejemplo: <code>/alerta auriculares sony 120</code>\n' +
           '(el número final es el precio máximo, opcional)' } }];
}
const texto = [
  `🔔 Alerta <b>#${a.id}</b> creada.`,
  `Buscaré: <b>${a.texto}</b>` + (a.precio_max ? ` por menos de <b>${a.precio_max} €</b>` : ''),
  '',
  'Te escribo en cuanto aparezca algo que supere mi verificación de precio.',
  'Gestiona tus alertas con <code>/misalertas</code>.'
].join('\n');
return [{ json: { chat_id: ctx.chat_id, texto } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Crear alerta", salida=1)
    enlazar(c, "Crear alerta", "Confirmar alerta")

    # botón "avísame si baja"
    y += paso * 2
    n.append(
        pg(
            "Alerta desde botón",
            (700, y),
            """WITH s AS (
    INSERT INTO suscriptores (telegram_user_id, chat_id, nombre)
    VALUES ($1, $2, $3)
    ON CONFLICT (telegram_user_id) DO UPDATE SET activo = TRUE, chat_id = EXCLUDED.chat_id
    RETURNING id
), o AS (
    SELECT COALESCE(titulo_limpio, titulo) AS t, precio_actual, categoria
    FROM ofertas WHERE id = $4
)
INSERT INTO alertas (suscriptor_id, texto, categoria, precio_max)
SELECT s.id,
       -- se queda con las 4 primeras palabras del título: patrón razonable de búsqueda
       (SELECT array_to_string((string_to_array(o.t, ' '))[1:4], ' ') FROM o),
       (SELECT categoria FROM o),
       (SELECT ROUND(precio_actual * 0.95, 2) FROM o)
FROM s
RETURNING id, texto, precio_max;""",
            replacement="={{ [$json.user_id, $json.chat_id, $json.nombre, $json.oferta_id] }}",
        )
    )
    n.append(
        code(
            "Confirmar alerta de botón",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const a = $input.first().json || {};
return [{ json: { chat_id: ctx.chat_id, texto:
  `🔔 Hecho. Te avisaré si <b>${a.texto || 'este producto'}</b> baja de <b>${a.precio_max || '—'} €</b>.\n` +
  `<i>Alerta #${a.id}. Puedes quitarla con /borrar ${a.id}.</i>` } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Alerta desde botón", salida=2)
    enlazar(c, "Alerta desde botón", "Confirmar alerta de botón")

    # /misalertas
    y += paso * 2
    n.append(
        pg(
            "Listar alertas",
            (700, y),
            """SELECT a.id, a.texto, a.categoria, a.precio_max, a.creada_en,
       (SELECT COUNT(*) FROM envios_alerta e WHERE e.alerta_id = a.id) AS avisos
FROM alertas a
JOIN suscriptores s ON s.id = a.suscriptor_id
WHERE s.telegram_user_id = $1 AND a.activa
ORDER BY a.creada_en DESC LIMIT 25;""",
            replacement="={{ [$json.user_id] }}",
            alwaysOutputData=True,
        )
    )
    n.append(
        code(
            "Formatear alertas",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const filas = $input.all().map(i => i.json).filter(f => f && f.id);
if (!filas.length) {
  return [{ json: { chat_id: ctx.chat_id,
    texto: 'No tienes alertas activas.\nCrea una con <code>/alerta zapatillas running 60</code>' } }];
}
const lineas = filas.map(f =>
  `<b>#${f.id}</b> · ${f.texto || f.categoria}` +
  (f.precio_max ? ` · máx ${f.precio_max} €` : '') +
  ` · ${f.avisos} aviso(s)`);
return [{ json: { chat_id: ctx.chat_id,
  texto: '📋 <b>Tus alertas</b>\n\n' + lineas.join('\n') + '\n\nElimina con <code>/borrar &lt;id&gt;</code>' } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Listar alertas", salida=3)
    enlazar(c, "Listar alertas", "Formatear alertas")

    # /borrar
    y += paso * 2
    n.append(
        pg(
            "Borrar alerta",
            (700, y),
            """UPDATE alertas a SET activa = FALSE
FROM suscriptores s
WHERE a.suscriptor_id = s.id AND s.telegram_user_id = $1
  AND a.id = NULLIF($2, '')::bigint
RETURNING a.id;""",
            replacement="={{ [$json.user_id, $json.argumento] }}",
            alwaysOutputData=True,
            onError="continueRegularOutput",
        )
    )
    n.append(
        code(
            "Confirmar borrado",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const f = $input.first()?.json;
return [{ json: { chat_id: ctx.chat_id, texto: (f && f.id)
  ? `🗑 Alerta #${f.id} eliminada.`
  : 'No he encontrado esa alerta. Consulta los identificadores con <code>/misalertas</code>.' } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Borrar alerta", salida=4)
    enlazar(c, "Borrar alerta", "Confirmar borrado")

    # /top
    y += paso * 2
    n.append(
        pg(
            "Top 24 h",
            (700, y),
            """SELECT COALESCE(titulo_limpio, titulo) AS titulo, precio_actual, descuento_real_pct,
       score, merchant, url_corta, es_minimo_historico, categoria
FROM ofertas
WHERE estado = 'publicada' AND publicada_en > now() - interval '24 hours'
ORDER BY score DESC LIMIT 10;""",
            alwaysOutputData=True,
        )
    )
    n.append(
        code(
            "Formatear top",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const filas = $input.all().map(i => i.json).filter(f => f && f.titulo);
if (!filas.length) {
  return [{ json: { chat_id: ctx.chat_id, texto: 'Todavía no hay chollos verificados en las últimas 24 h.' } }];
}
const eur = v => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
const lineas = filas.map((f, i) =>
  `${i + 1}. ${f.es_minimo_historico ? '🏆 ' : ''}<a href="${f.url_corta}">${f.titulo.slice(0, 70)}</a>\n` +
  `    <b>${eur(f.precio_actual)}</b>` +
  (f.descuento_real_pct ? ` · −${Math.round(f.descuento_real_pct)}% real` : '') +
  ` · ⭐${f.score} · ${f.merchant || ''}`);
return [{ json: { chat_id: ctx.chat_id,
  texto: '🔥 <b>Top chollos verificados · 24 h</b>\n\n' + lineas.join('\n') +
         '\n\n<i>🔗 Enlaces de afiliado.</i>' } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Top 24 h", salida=5)
    enlazar(c, "Top 24 h", "Formatear top")

    # /buscar
    y += paso * 2
    n.append(
        pg(
            "Buscar publicadas",
            (700, y),
            """SELECT COALESCE(titulo_limpio, titulo) AS titulo, precio_actual, descuento_real_pct,
       score, merchant, url_corta, publicada_en,
       similarity(unaccent(lower(titulo)), unaccent(lower($1))) AS parecido
FROM ofertas
WHERE estado = 'publicada'
  AND publicada_en > now() - interval '30 days'
  AND unaccent(lower(titulo)) % unaccent(lower($1))
ORDER BY parecido DESC, score DESC
LIMIT 8;""",
            replacement="={{ [$json.argumento] }}",
            alwaysOutputData=True,
            onError="continueRegularOutput",
        )
    )
    n.append(
        code(
            "Formatear búsqueda",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const filas = $input.all().map(i => i.json).filter(f => f && f.titulo);
const eur = v => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
if (!filas.length) {
  return [{ json: { chat_id: ctx.chat_id,
    texto: `No he encontrado nada publicado sobre <b>${ctx.argumento}</b>.\n` +
           `Crea una alerta y te aviso cuando aparezca:\n<code>/alerta ${ctx.argumento}</code>` } }];
}
const lineas = filas.map(f =>
  `• <a href="${f.url_corta}">${f.titulo.slice(0, 70)}</a> — <b>${eur(f.precio_actual)}</b>` +
  (f.descuento_real_pct ? ` (−${Math.round(f.descuento_real_pct)}%)` : ''));
return [{ json: { chat_id: ctx.chat_id,
  texto: `🔎 Resultados para <b>${ctx.argumento}</b>\n\n` + lineas.join('\n') +
         '\n\n<i>🔗 Enlaces de afiliado.</i>' } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Buscar publicadas", salida=6)
    enlazar(c, "Buscar publicadas", "Formatear búsqueda")

    # histórico
    y += paso * 2
    n.append(
        pg(
            "Serie de precios",
            (700, y),
            """SELECT date_trunc('day', p.fecha) AS dia, MIN(p.precio) AS precio
FROM precios_historico p
JOIN ofertas o ON o.clave_producto = p.clave_producto
WHERE o.id = $1 AND p.fecha > now() - interval '90 days'
GROUP BY 1 ORDER BY 1;""",
            replacement="={{ [$json.oferta_id] }}",
            alwaysOutputData=True,
        )
    )
    n.append(
        code(
            "Dibujar histórico",
            (940, y),
            r"""
// Gráfico de barras en texto: funciona en cualquier cliente de Telegram sin generar imágenes.
const ctx = $('Interpretar mensaje').first().json;
const filas = $input.all().map(i => i.json).filter(f => f && f.precio != null);
if (filas.length < 2) {
  return [{ json: { chat_id: ctx.chat_id,
    texto: 'Aún no tengo suficiente histórico de este producto. Lo estoy siguiendo desde hoy.' } }];
}
const precios = filas.map(f => Number(f.precio));
const min = Math.min(...precios), max = Math.max(...precios), ult = precios[precios.length - 1];
const BLOQUES = '▁▂▃▄▅▆▇█';
const spark = precios.slice(-40).map(p => BLOQUES[Math.round((p - min) / ((max - min) || 1) * 7)]).join('');
const eur = v => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
const texto = [
  '📉 <b>Histórico de precio · 90 días</b>',
  '',
  `<code>${spark}</code>`,
  '',
  `Mínimo: <b>${eur(min)}</b>   Máximo: ${eur(max)}`,
  `Ahora: <b>${eur(ult)}</b>` + (ult <= min * 1.005 ? '  🏆 <b>mínimo histórico</b>' : ''),
  `Muestras: ${precios.length} días`,
  '',
  '<i>Datos recogidos por el propio bot, no el PVP que declara la tienda.</i>'
].join('\n');
return [{ json: { chat_id: ctx.chat_id, texto } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Serie de precios", salida=7)
    enlazar(c, "Serie de precios", "Dibujar histórico")

    # /categorias
    y += paso * 2
    n.append(
        pg(
            "Categorías con actividad",
            (700, y),
            """SELECT categoria, COUNT(*) AS n, ROUND(AVG(descuento_real_pct)) AS desc_medio
FROM ofertas
WHERE estado = 'publicada' AND publicada_en > now() - interval '7 days'
GROUP BY categoria ORDER BY n DESC;""",
            alwaysOutputData=True,
        )
    )
    n.append(
        code(
            "Formatear categorías",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
const EMOJI = { informatica:'💻', electronica:'🔌', movil:'📱', videojuegos:'🎮', hogar:'🏠',
  electrodomesticos:'🧊', moda:'👕', deporte:'🏃', belleza:'💄', alimentacion:'🛒',
  juguetes:'🧸', jardin:'🌿', motor:'🚗', libros:'📚', viajes:'✈️', servicios:'🧾', otros:'🎁' };
const filas = $input.all().map(i => i.json).filter(f => f && f.categoria);
const lineas = filas.map(f =>
  `${EMOJI[f.categoria] || '•'} <b>${f.categoria}</b> — ${f.n} ofertas · −${f.desc_medio || 0}% medio`);
return [{ json: { chat_id: ctx.chat_id, texto:
  '🗂 <b>Categorías activas (7 días)</b>\n\n' + (lineas.join('\n') || 'Sin actividad todavía.') +
  '\n\nCrea una alerta por categoría: <code>/alerta hogar</code>' } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Categorías con actividad", salida=8)
    enlazar(c, "Categorías con actividad", "Formatear categorías")

    # /baja
    y += paso * 2
    n.append(
        pg(
            "Dar de baja",
            (700, y),
            "UPDATE suscriptores SET activo = FALSE WHERE telegram_user_id = $1 RETURNING id;",
            replacement="={{ [$json.user_id] }}",
            alwaysOutputData=True,
        )
    )
    n.append(
        code(
            "Confirmar baja",
            (940, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
return [{ json: { chat_id: ctx.chat_id, texto:
  '🚪 Listo, no volveré a escribirte por privado. Tus alertas quedan pausadas.\n' +
  'Vuelve cuando quieras con /start.' } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Dar de baja", salida=9)
    enlazar(c, "Dar de baja", "Confirmar baja")

    # fallback /ayuda
    y += paso * 2
    n.append(
        code(
            "Texto de ayuda",
            (700, y),
            r"""
const ctx = $('Interpretar mensaje').first().json;
return [{ json: { chat_id: ctx.chat_id, texto: [
  '🤖 <b>ChollosBot</b> — comandos',
  '',
  '🔔 <code>/alerta &lt;texto&gt; [precio]</code> — avisos a medida',
  '📋 <code>/misalertas</code> · 🗑 <code>/borrar &lt;id&gt;</code>',
  '🔥 <code>/top</code> — mejores chollos verificados 24 h',
  '🔎 <code>/buscar &lt;texto&gt;</code> · 🗂 <code>/categorias</code>',
  '🚪 <code>/baja</code>',
  '',
  '<i>Verifico cada precio contra su histórico real de 90 días antes de publicarlo.</i>'
].join('\n') } }];
""",
        )
    )
    enlazar(c, "Enrutar comando", "Texto de ayuda", salida=10)

    # respuesta única
    n.append(
        tg_api(
            "Responder en Telegram",
            (1260, 320),
            "sendMessage",
            "={{ JSON.stringify({ chat_id: $json.chat_id, text: $json.texto, parse_mode: 'HTML', disable_web_page_preview: true }) }}",
            onError="continueRegularOutput",
        )
    )
    for origen in [
        "Texto de bienvenida",
        "Confirmar alerta",
        "Confirmar alerta de botón",
        "Formatear alertas",
        "Confirmar borrado",
        "Formatear top",
        "Formatear búsqueda",
        "Dibujar histórico",
        "Formatear categorías",
        "Confirmar baja",
        "Texto de ayuda",
    ]:
        enlazar(c, origen, "Responder en Telegram")

    return workflow(
        "ChollosBot 04 · Bot de Telegram (comandos y alertas)",
        n,
        c,
        ["chollosbot", "telegram", "bot"],
    )


# ===========================================================================
# WF 05 · VIGENCIA DE OFERTAS E INFORME DIARIO
# ===========================================================================
def wf_mantenimiento():
    n, c = [], {}

    n.append(
        sticky(
            "## 5 · Vigencia e informe\n\n"
            "**Cada hora**: revisa las ofertas publicadas en las últimas 96 h. Si el precio ha subido "
            "o el producto está agotado, edita el mensaje ya publicado para marcarlo como caducado. "
            "Un canal donde la mitad de los enlaces están muertos pierde la confianza del usuario.\n\n"
            "**Cada día a las 08:00**: informe al canal de administración con captación, "
            "publicaciones, clics, ventas conciliadas, comisión y EPC por categoría.",
            (-640, -120),
            520,
            340,
            2,
        )
    )

    # --- verificación horaria -------------------------------------------------
    n.append(
        nodo(
            "Cada hora",
            "n8n-nodes-base.scheduleTrigger",
            1.2,
            (-40, 160),
            {"rule": {"interval": [{"field": "hours", "hoursInterval": 1}]}},
        )
    )
    n.append(
        pg(
            "Publicadas a revisar",
            (180, 160),
            """SELECT id, url_original, clave_producto, dominio, precio_actual, canal_chat_id,
       telegram_message_id, COALESCE(titulo_limpio, titulo) AS titulo, url_corta
FROM ofertas
WHERE estado = 'publicada'
  AND publicada_en > now() - interval '96 hours'
  AND (verificada_en IS NULL OR verificada_en < now() - interval '2 hours')
ORDER BY publicada_en DESC
LIMIT 25;""",
        )
    )
    enlazar(c, "Cada hora", "Publicadas a revisar")

    n.append(
        http(
            "Releer ficha de producto",
            (400, 160),
            {
                "method": "GET",
                "url": "={{ $json.url_original }}",
                "sendHeaders": True,
                "specifyHeaders": "json",
                "jsonHeaders": '={{ JSON.stringify({ "User-Agent": $env.SCRAPER_USER_AGENT || "ChollosBot/1.0 (+contacto@ejemplo.es)", "Accept-Language": "es-ES,es;q=0.9" }) }}',
                "options": {
                    "timeout": 25000,
                    "batching": {"batch": {"batchSize": 3, "batchInterval": 2000}},
                    "response": {"response": {"neverError": True, "responseFormat": "text"}},
                },
            },
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Publicadas a revisar", "Releer ficha de producto")

    n.append(
        code(
            "Comparar precio actual",
            (620, 160),
            r"""
const previas = $('Publicadas a revisar').all().map(i => i.json);
const salida = [];

const num = (v) => {
  if (v == null) return null;
  let s = String(v).replace(/[^0-9.,-]/g, '');
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma > punto) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const nn = parseFloat(s); return isFinite(nn) ? nn : null;
};

const entradas = $input.all();
for (let i = 0; i < entradas.length; i++) {
  const o = previas[i]; if (!o) continue;
  const html = String(entradas[i].json?.data || entradas[i].json?.body || '');

  let precio = null, agotado = false;
  for (const b of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(b[1].trim());
      const lista = Array.isArray(d) ? d : (d['@graph'] || [d]);
      for (const p of lista) {
        const of = Array.isArray(p?.offers) ? p.offers[0] : p?.offers;
        if (of?.price != null) { precio = num(of.price); agotado = /OutOfStock|SoldOut/i.test(of.availability || ''); }
      }
    } catch (e) { /* ficha sin JSON-LD válido */ }
  }

  const sinDatos = precio === null && !html;
  const subida = precio !== null && precio > Number(o.precio_actual) * 1.05;
  const caducada = agotado || subida;

  salida.push({ json: {
    ...o,
    precio_nuevo: precio,
    agotado,
    caducada,
    motivo: agotado ? 'agotado' : (subida ? 'subida_de_precio' : null),
    verificable: !sinDatos,
    // Solo se edita el mensaje si hay certeza: sin datos, se deja como está
    editar: caducada && !!o.telegram_message_id
  }});
}
return salida;
""",
        )
    )
    enlazar(c, "Releer ficha de producto", "Comparar precio actual")

    n.append(
        nodo_if(
            "¿Ha caducado?",
            (840, 160),
            [condicion("={{ $json.editar }}", "true", "", "boolean")],
        )
    )
    enlazar(c, "Comparar precio actual", "¿Ha caducado?")

    n.append(
        tg_api(
            "Marcar caducada en el canal",
            (1060, 60),
            "editMessageCaption",
            "={{ JSON.stringify({ chat_id: $json.canal_chat_id, message_id: $json.telegram_message_id, caption: '⛔️ <b>OFERTA CADUCADA</b>  (' + ($json.motivo === 'agotado' ? 'sin stock' : 'ha subido de precio' + ($json.precio_nuevo ? ' a ' + $json.precio_nuevo + ' €' : '')) + ')\\n\\n<s>' + $json.titulo + '</s>\\n\\n<i>Verificado automáticamente el ' + new Date().toLocaleString('es-ES') + '</i>', parse_mode: 'HTML' }) }}",
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "¿Ha caducado?", "Marcar caducada en el canal", salida=0)

    n.append(
        pg(
            "Actualizar estado",
            (1280, 160),
            """UPDATE ofertas SET
    estado = CASE WHEN $2::boolean THEN 'caducada' ELSE estado END,
    stock  = NOT $3::boolean,
    precio_actual = COALESCE($4::numeric, precio_actual),
    verificada_en = now()
WHERE id = $1
RETURNING id, estado, precio_actual;""",
            replacement="={{ [$json.id, $json.caducada, $json.agotado, $json.precio_nuevo] }}",
        )
    )
    enlazar(c, "Marcar caducada en el canal", "Actualizar estado")
    enlazar(c, "¿Ha caducado?", "Actualizar estado", salida=1)

    n.append(
        pg(
            "Guardar precio revisado",
            (1500, 160),
            "INSERT INTO precios_historico (clave_producto, dominio, precio, fuente)\n"
            "SELECT clave_producto, dominio, $2::numeric, 'verificacion'\n"
            "FROM ofertas WHERE id = $1 AND $2::numeric IS NOT NULL\n"
            "ON CONFLICT DO NOTHING RETURNING id;",
            replacement="={{ [$json.id, $('Comparar precio actual').item.json.precio_nuevo] }}",
            alwaysOutputData=True,
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Actualizar estado", "Guardar precio revisado")

    # --- informe diario -------------------------------------------------------
    n.append(
        nodo(
            "Cada día a las 08:00",
            "n8n-nodes-base.scheduleTrigger",
            1.2,
            (-40, 620),
            {"rule": {"interval": [{"field": "cronExpression", "expression": "0 8 * * *"}]}},
        )
    )
    n.append(
        pg(
            "Métricas del día",
            (180, 620),
            """SELECT
  (SELECT COUNT(*) FROM ofertas WHERE creada_en > now() - interval '24 hours')            AS captadas,
  (SELECT COUNT(*) FROM ofertas WHERE publicada_en > now() - interval '24 hours')         AS publicadas,
  (SELECT COUNT(*) FROM ofertas WHERE estado = 'descartada'
                                  AND actualizada_en > now() - interval '24 hours')       AS descartadas,
  (SELECT COUNT(*) FROM ofertas WHERE estado = 'caducada'
                                  AND actualizada_en > now() - interval '24 hours')       AS caducadas,
  (SELECT COUNT(*) FROM clicks WHERE creado_en > now() - interval '24 hours')             AS clics,
  (SELECT COUNT(*) FROM conversiones WHERE fecha > now() - interval '24 hours')           AS ventas,
  (SELECT COALESCE(SUM(comision),0) FROM conversiones
     WHERE fecha > now() - interval '24 hours' AND estado <> 'rechazada')                 AS comision,
  (SELECT COALESCE(SUM(comision_estimada),0) FROM ofertas
     WHERE publicada_en > now() - interval '24 hours')                                    AS comision_potencial,
  (SELECT COUNT(*) FROM suscriptores WHERE activo)                                        AS suscriptores,
  (SELECT COUNT(*) FROM suscriptores WHERE creado_en > now() - interval '24 hours')       AS altas,
  (SELECT COUNT(*) FROM alertas WHERE activa)                                             AS alertas_activas,
  (SELECT COUNT(*) FROM ofertas WHERE pvp_inflado AND creada_en > now() - interval '24 hours') AS pvp_inflados,
  -- Clics y comisión se agregan por separado antes de unirse: un JOIN directo
  -- entre clicks y conversiones multiplicaría filas e inflaría el EPC.
  (SELECT json_agg(x) FROM (
      SELECT o.categoria,
             COUNT(*)                                    AS ofertas,
             COALESCE(SUM(c.clics), 0)                   AS clics,
             ROUND(COALESCE(SUM(v.comision), 0)
                   / NULLIF(SUM(c.clics), 0), 3)         AS epc
      FROM ofertas o
      LEFT JOIN (SELECT oferta_id, COUNT(*) AS clics FROM clicks
                 WHERE creado_en > now() - interval '7 days' GROUP BY oferta_id) c
             ON c.oferta_id = o.id
      LEFT JOIN (SELECT oferta_id, SUM(comision) AS comision FROM conversiones
                 WHERE estado <> 'rechazada' GROUP BY oferta_id) v
             ON v.oferta_id = o.id
      WHERE o.publicada_en > now() - interval '7 days'
      GROUP BY o.categoria ORDER BY clics DESC NULLS LAST LIMIT 8) x)                     AS por_categoria,
  (SELECT chat_id FROM canales WHERE lower(nombre) = 'admin' AND activo LIMIT 1)          AS chat_admin;""",
        )
    )
    enlazar(c, "Cada día a las 08:00", "Métricas del día")

    n.append(
        code(
            "Redactar informe",
            (400, 620),
            r"""
const m = $input.first().json;
const eur = v => Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';

const cat = (m.por_categoria || []).map(c =>
  `  · ${c.categoria || 'sin categoría'}: ${c.clics || 0} clics · EPC ${c.epc ?? '—'}`).join('\n');

const texto = [
  '📊 <b>Informe ChollosBot · últimas 24 h</b>',
  '',
  `🔎 Captadas: <b>${m.captadas}</b>   ✅ Publicadas: <b>${m.publicadas}</b>   ❌ Descartadas: ${m.descartadas}`,
  `⛔️ Caducadas: ${m.caducadas}   ⚠️ PVP inflados detectados: <b>${m.pvp_inflados}</b>`,
  `📈 Tasa de publicación: ${pct(m.publicadas, m.captadas)}`,
  '',
  `👆 Clics: <b>${m.clics}</b>   💰 Ventas conciliadas: <b>${m.ventas}</b>   (CR ${pct(m.ventas, m.clics)})`,
  `💶 Comisión confirmada: <b>${eur(m.comision)}</b>`,
  `🎯 Comisión potencial de lo publicado: ${eur(m.comision_potencial)}`,
  `📊 EPC global: ${m.clics ? (Number(m.comision) / Number(m.clics)).toFixed(3) : '—'} € por clic`,
  '',
  `👥 Suscriptores: <b>${m.suscriptores}</b> (+${m.altas})   🔔 Alertas activas: ${m.alertas_activas}`,
  '',
  '<b>Rendimiento por categoría (7 días)</b>',
  cat || '  sin datos'
].join('\n');

return [{ json: { chat_id: m.chat_admin || $env.TELEGRAM_CHAT_ADMIN, texto } }];
""",
        )
    )
    enlazar(c, "Métricas del día", "Redactar informe")

    n.append(
        tg_api(
            "Enviar informe a administración",
            (620, 620),
            "sendMessage",
            "={{ JSON.stringify({ chat_id: $json.chat_id, text: $json.texto, parse_mode: 'HTML' }) }}",
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Redactar informe", "Enviar informe a administración")

    n.append(
        pg(
            "Purgar histórico antiguo",
            (840, 620),
            "DELETE FROM precios_historico WHERE fecha < now() - interval '400 days';\n"
            "DELETE FROM clicks WHERE creado_en < now() - interval '180 days';\n"
            "DELETE FROM ofertas WHERE estado = 'descartada' AND creada_en < now() - interval '30 days';",
        )
    )
    enlazar(c, "Enviar informe a administración", "Purgar histórico antiguo")

    return workflow(
        "ChollosBot 05 · Vigencia de ofertas e informe diario",
        n,
        c,
        ["chollosbot", "mantenimiento"],
    )


# ===========================================================================
# WF 06 · REDIRECTOR DE CLICS Y POSTBACK DE CONVERSIONES
# ===========================================================================
def wf_redirector():
    n, c = [], {}

    n.append(
        sticky(
            "## 6 · Atribución del % de venta\n\n"
            "**`GET /webhook/r/:id`** — todos los botones del canal apuntan aquí, nunca directamente "
            "a la red de afiliación. Registra el clic, genera un SubID único y redirige (302) al "
            "deeplink monetizado. Ventajas: se puede cambiar de red sin reeditar mensajes antiguos, "
            "se miden clics reales y se detectan enlaces rotos.\n\n"
            "**`POST /webhook/postback/:red`** — endpoint para el postback S2S de Awin / Tradedoubler / "
            "Admitad / Impact. Devuelve el SubID emitido en el clic, con lo que cada venta y su comisión "
            "quedan atribuidas a una oferta, un canal y una categoría concretos. Eso realimenta el EPC "
            "por categoría del informe diario.\n\n"
            "🔐 Protege el postback con el token compartido `POSTBACK_TOKEN`.\n"
            "🔒 No se almacena IP ni user-agent en claro: solo un hash truncado (RGPD).",
            (-660, -220),
            560,
            460,
            4,
        )
    )

    # --- redirector -----------------------------------------------------------
    n.append(
        nodo(
            "GET /r/:id",
            "n8n-nodes-base.webhook",
            2,
            (-60, 120),
            {
                "httpMethod": "GET",
                "path": "r/:id",
                "responseMode": "responseNode",
                "options": {"rawBody": False},
            },
            webhookId=str(uuid.uuid5(NS, "wh-redirect")),
        )
    )
    n.append(
        pg(
            "Cargar destino",
            (180, 120),
            "SELECT id, url_afiliado, url_original, categoria, dominio, red_afiliado,\n"
            "       comision_pct, estado, canal_chat_id\n"
            "FROM ofertas WHERE id = NULLIF($1, '')::bigint;",
            replacement="={{ [$json.params.id] }}",
            alwaysOutputData=True,
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "GET /r/:id", "Cargar destino")

    n.append(
        code(
            "Construir destino con SubID",
            (400, 120),
            r"""
const crypto = require('crypto');
const peticion = $('GET /r/:id').first().json;
const o = $input.first()?.json || {};

// Sin oferta válida: se manda al canal en vez de a una página de error.
if (!o.id) {
  return [{ json: { destino: $env.CANAL_PUBLICO_URL || 'https://t.me/tu_canal_chollos',
                    oferta_id: null, subid: 'invalido', canal: 'desconocido', huella: null,
                    referer: null } }];
}

const canal = (peticion.query && peticion.query.c) || 'general';
const nonce = crypto.randomBytes(3).toString('hex');
const subid = `o${o.id}-c${canal}-${nonce}`;

// Se reescribe el SubID del deeplink con el del clic concreto: así la conversión
// que devuelva la red se puede atribuir a este clic exacto.
let destino = o.url_afiliado || o.url_original;
destino = destino.replace(/(ascsubtag|clickref|epi|subid|customid|aff_fcid|subId1|utm_campaign)=[^&]*/,
                          (m) => m.split('=')[0] + '=' + subid);

// Huella anónima para detectar clics duplicados sin guardar datos personales (RGPD).
const cabeceras = peticion.headers || {};
const huella = crypto.createHash('sha256')
  .update(String(cabeceras['user-agent'] || '') + '|' +
          String(cabeceras['x-forwarded-for'] || '').split(',')[0] + '|' +
          new Date().toISOString().slice(0, 10) + '|' + ($env.HASH_SALT || 'chollosbot'))
  .digest('hex').slice(0, 32);

return [{ json: {
  destino, oferta_id: o.id, subid, canal, huella,
  referer: (cabeceras.referer || cabeceras.referrer || null)
}}];
""",
        )
    )
    enlazar(c, "Cargar destino", "Construir destino con SubID")

    n.append(
        pg(
            "Registrar clic",
            (620, 120),
            "INSERT INTO clicks (oferta_id, subid, canal, huella, referer)\n"
            "VALUES ($1, $2, $3, $4, $5)\n"
            "RETURNING id;",
            replacement="={{ [$json.oferta_id, $json.subid, $json.canal, $json.huella, $json.referer] }}",
            alwaysOutputData=True,
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "Construir destino con SubID", "Registrar clic")

    n.append(
        nodo(
            "Redirigir 302",
            "n8n-nodes-base.respondToWebhook",
            1.1,
            (840, 120),
            {
                "respondWith": "text",
                "responseBody": "=Redirigiendo a la oferta…",
                "options": {
                    "responseCode": 302,
                    "responseHeaders": {
                        "entries": [
                            {
                                "name": "Location",
                                "value": "={{ $('Construir destino con SubID').item.json.destino }}",
                            },
                            {"name": "Cache-Control", "value": "no-store"},
                            {"name": "Referrer-Policy", "value": "no-referrer"},
                        ]
                    },
                },
            },
        )
    )
    enlazar(c, "Registrar clic", "Redirigir 302")

    # --- postback -------------------------------------------------------------
    n.append(
        nodo(
            "POST /postback/:red",
            "n8n-nodes-base.webhook",
            2,
            (-60, 520),
            {
                "httpMethod": "POST",
                "path": "postback/:red",
                "responseMode": "responseNode",
                "options": {},
            },
            webhookId=str(uuid.uuid5(NS, "wh-postback")),
        )
    )
    n.append(
        code(
            "Normalizar postback",
            (180, 520),
            r"""
// Cada red nombra los campos a su manera; aquí se unifican.
const p = $input.first().json;
const cuerpo = { ...(p.body || {}), ...(p.query || {}) };
const red = (p.params && p.params.red) || cuerpo.red || 'desconocida';

const token = cuerpo.token || (p.headers && p.headers['x-postback-token']);
const autorizado = !$env.POSTBACK_TOKEN || token === $env.POSTBACK_TOKEN;

const primero = (...claves) => {
  for (const k of claves) if (cuerpo[k] !== undefined && cuerpo[k] !== '') return cuerpo[k];
  return null;
};

const subid = primero('clickref','epi','subid','customid','subId1','aff_fcid','ascsubtag','sid');
const oferta = subid ? parseInt(String(subid).match(/^o(\d+)/)?.[1] || '', 10) : null;
const venta = parseFloat(primero('saleAmount','amount','order_sum','payout_sum','sale') || 0) || null;
const comision = parseFloat(primero('commissionAmount','commission','payout','action_payment') || 0) || null;

return [{ json: {
  autorizado, red,
  id_externo: String(primero('id','transactionId','order_id','action_id','conversion_id')
                     || `${red}-${subid}-${Date.now()}`),
  subid, oferta_id: Number.isFinite(oferta) ? oferta : null,
  importe_venta: venta, comision,
  comision_pct: (venta && comision) ? Number((100 * comision / venta).toFixed(2)) : null,
  estado: String(primero('status','estado') || 'pendiente').toLowerCase()
    .replace('approved','aprobada').replace('pending','pendiente').replace('declined','rechazada')
}}];
""",
        )
    )
    enlazar(c, "POST /postback/:red", "Normalizar postback")

    n.append(
        nodo_if(
            "¿Postback autorizado?",
            (400, 520),
            [condicion("={{ $json.autorizado }}", "true", "", "boolean")],
        )
    )
    enlazar(c, "Normalizar postback", "¿Postback autorizado?")

    n.append(
        pg(
            "Guardar conversión",
            (620, 440),
            """INSERT INTO conversiones (red, id_externo, subid, oferta_id, importe_venta,
                          comision, comision_pct, estado)
VALUES ($1, $2, $3, NULLIF($4,'')::bigint, $5::numeric, $6::numeric, $7::numeric, $8)
ON CONFLICT (red, id_externo) DO UPDATE
    SET estado = EXCLUDED.estado,
        comision = COALESCE(EXCLUDED.comision, conversiones.comision),
        importe_venta = COALESCE(EXCLUDED.importe_venta, conversiones.importe_venta)
RETURNING id, oferta_id, comision, estado;""",
            replacement=(
                "={{ [$json.red, $json.id_externo, $json.subid, $json.oferta_id, "
                "$json.importe_venta, $json.comision, $json.comision_pct, $json.estado] }}"
            ),
            onError="continueRegularOutput",
        )
    )
    enlazar(c, "¿Postback autorizado?", "Guardar conversión", salida=0)

    n.append(
        nodo(
            "Responder OK",
            "n8n-nodes-base.respondToWebhook",
            1.1,
            (840, 440),
            {
                "respondWith": "json",
                "responseBody": '={{ JSON.stringify({ ok: true, conversion: $json.id ?? null }) }}',
                "options": {"responseCode": 200},
            },
        )
    )
    enlazar(c, "Guardar conversión", "Responder OK")

    n.append(
        nodo(
            "Responder 401",
            "n8n-nodes-base.respondToWebhook",
            1.1,
            (620, 620),
            {
                "respondWith": "json",
                "responseBody": '={{ JSON.stringify({ ok: false, error: "token no válido" }) }}',
                "options": {"responseCode": 401},
            },
        )
    )
    enlazar(c, "¿Postback autorizado?", "Responder 401", salida=1)

    return workflow(
        "ChollosBot 06 · Redirector de clics y postback de ventas",
        n,
        c,
        ["chollosbot", "afiliacion", "atribucion"],
    )


# ===========================================================================
def main():
    print("Generando workflows n8n de ChollosBot ES…")
    guardar(wf_ingesta(), "01-ingesta-ofertas.json")
    guardar(wf_clasificacion(), "02-clasificacion-scoring.json")
    guardar(wf_publicacion(), "03-publicacion-telegram.json")
    guardar(wf_bot(), "04-bot-telegram.json")
    guardar(wf_mantenimiento(), "05-vigencia-e-informes.json")
    guardar(wf_redirector(), "06-redirector-y-postback.json")
    print("Listo.")


if __name__ == "__main__":
    main()
