#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prueba de extremo a extremo de la capa de datos de ChollosBot.

No simula las consultas: las extrae de los JSON de n8n/workflows/ por nombre de
nodo y las ejecuta con parámetros reales contra un PostgreSQL. Así, si alguien
cambia una consulta en el workflow y rompe el flujo, esta prueba falla.

    export CHOLLOS_DSN="postgresql://postgres@/chollos?host=/tmp&port=55432"
    python3 tests/test_flujo_datos.py

Requiere psql en el PATH y una base de datos vacía (la recrea).
"""

import json
import os
import pathlib
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DSN = os.environ.get("CHOLLOS_DSN", "postgresql://postgres@/chollos?host=/tmp&port=55432")

fallos = []


def sql(consulta, esperar_error=False):
    r = subprocess.run(
        ["psql", DSN, "-v", "ON_ERROR_STOP=1", "-q", "-tA", "-F", "|", "-c", consulta],
        capture_output=True,
        text=True,
    )
    if r.returncode and not esperar_error:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()


def cargar_consultas():
    """{nombre_de_nodo: consulta} de todos los workflows."""
    consultas = {}
    for f in sorted((RAIZ / "n8n" / "workflows").glob("*.json")):
        for n in json.loads(f.read_text(encoding="utf-8"))["nodes"]:
            q = n["parameters"].get("query")
            if q:
                consultas[n["name"]] = q
    return consultas


def ejecutar_nodo(consultas, nombre, *params):
    """Ejecuta la consulta real del nodo con parámetros, vía PREPARE/EXECUTE."""
    q = consultas[nombre].rstrip().rstrip(";")
    args = ", ".join("NULL" if p is None else "$$%s$$" % p for p in params)
    invocacion = f"EXECUTE _t({args})" if params else "EXECUTE _t"
    return sql(f"DEALLOCATE ALL; PREPARE _t AS {q}; {invocacion};")


def comprobar(descripcion, condicion, detalle=""):
    if condicion:
        print(f"  ✓ {descripcion}")
    else:
        fallos.append(descripcion)
        print(f"  ✗ {descripcion}  {detalle}")


def main():
    consultas = cargar_consultas()
    print(f"Consultas cargadas desde los workflows: {len(consultas)}\n")

    print("· Preparando esquema")
    for fichero in ("db/schema.sql", "db/seed.sql"):
        r = subprocess.run(
            ["psql", DSN, "-v", "ON_ERROR_STOP=1", "-q", "-f", str(RAIZ / fichero)],
            capture_output=True,
            text=True,
        )
        if r.returncode:
            print(r.stderr)
            sys.exit(1)
    sql("TRUNCATE ofertas, precios_historico, clicks, conversiones, "
        "suscriptores, alertas, envios_alerta, publicaciones RESTART IDENTITY CASCADE;")

    # -- 1. Ingesta ----------------------------------------------------------
    print("\n· WF01 · ingesta y deduplicación")
    lote = [
        {
            "hash_dedupe": "h1", "clave_producto": "asin:B0TEST0001", "fuente": "Amazon PA-API",
            "merchant": "Amazon", "dominio": "amazon.es",
            "url_original": "https://www.amazon.es/dp/B0TEST0001",
            "titulo": "Auriculares Sony WH-1000XM5", "descripcion": "Cancelación de ruido",
            "imagen": "https://img/1.jpg", "marca": "Sony", "ean": None, "asin": "B0TEST0001",
            "categoria_fuente": "electronica", "pais": "ES",
            "precio_actual": 249.00, "precio_anterior": 419.00, "moneda": "EUR",
            "envio_coste": 0, "envio_gratis": True, "cupon": None, "payload": {"origen": "test"},
        },
        {
            "hash_dedupe": "h2", "clave_producto": "ean:8412345678901", "fuente": "Awin",
            "merchant": "PcComponentes", "dominio": "pccomponentes.com",
            "url_original": "https://www.pccomponentes.com/ssd-test",
            "titulo": "SSD NVMe 2TB", "descripcion": "PCIe 4.0", "imagen": "https://img/2.jpg",
            "marca": "Samsung", "ean": "8412345678901", "asin": None,
            "categoria_fuente": "informatica", "pais": "ES",
            "precio_actual": 99.90, "precio_anterior": 149.00, "moneda": "EUR",
            "envio_coste": 0, "envio_gratis": True, "cupon": None, "payload": {},
        },
        {   # comercio sin programa de afiliación: debe acabar descartado
            "hash_dedupe": "h3", "clave_producto": "url:tienda-rara.es/x", "fuente": "rss",
            "merchant": "tienda-rara.es", "dominio": "tienda-rara.es",
            "url_original": "https://tienda-rara.es/x", "titulo": "Cosa sin programa",
            "descripcion": None, "imagen": None, "marca": None, "ean": None, "asin": None,
            "categoria_fuente": None, "pais": "ES",
            "precio_actual": 50.00, "precio_anterior": 100.00, "moneda": "EUR",
            "envio_coste": 0, "envio_gratis": False, "cupon": None, "payload": {},
        },
    ]
    salida = ejecutar_nodo(consultas, "Guardar ofertas e histórico", json.dumps(lote))
    altas, actualizadas, pendientes, muestras = salida.split("|")
    comprobar("3 altas nuevas", altas == "3", salida)
    comprobar("3 muestras de precio guardadas", muestras == "3", salida)

    salida = ejecutar_nodo(consultas, "Guardar ofertas e histórico", json.dumps(lote))
    comprobar("reejecución no duplica (0 altas)", salida.split("|")[0] == "0", salida)
    comprobar(
        "una sola muestra por producto y día",
        sql("SELECT count(*) FROM precios_historico;") == "3",
    )

    # Bajada de precio >3% sobre una oferta ya publicada -> se reabre
    sql("UPDATE ofertas SET estado='publicada' WHERE hash_dedupe='h1';")
    lote_bajada = json.loads(json.dumps(lote))
    lote_bajada[0]["precio_actual"] = 199.00
    ejecutar_nodo(consultas, "Guardar ofertas e histórico", json.dumps(lote_bajada))
    comprobar(
        "una bajada del 20% reabre la oferta publicada",
        sql("SELECT estado FROM ofertas WHERE hash_dedupe='h1';") == "nueva",
    )

    # -- 2. Clasificación ----------------------------------------------------
    print("\n· WF02 · candidatas con histórico")
    sql("""INSERT INTO precios_historico (clave_producto, dominio, precio, fecha, fecha_dia)
           SELECT 'asin:B0TEST0001', 'amazon.es', 250 + (random()*40)::numeric(10,2),
                  now() - (g || ' days')::interval, (CURRENT_DATE - g)
           FROM generate_series(1, 60) g;""")
    filas = ejecutar_nodo(consultas, "Cargar candidatas con histórico").split("\n")
    comprobar("devuelve las 3 candidatas", len([f for f in filas if f]) == 3, str(filas)[:120])
    cabecera = sql("""SELECT h.precio_mediana_90d, h.muestras_90d
                      FROM ofertas o, LATERAL (
                        SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY p.precio)
                                 FILTER (WHERE p.fecha > now() - interval '90 days'))::numeric(12,2) AS precio_mediana_90d,
                               count(*) FILTER (WHERE p.fecha > now() - interval '90 days') AS muestras_90d
                        FROM precios_historico p WHERE p.clave_producto = o.clave_producto) h
                      WHERE o.hash_dedupe='h1';""")
    mediana, n_muestras = cabecera.split("|")
    comprobar("mediana histórica calculada", float(mediana) > 240, cabecera)
    comprobar("62 muestras en 90 días", n_muestras == "62", cabecera)

    print("\n· WF02 · descarte y guardado de clasificación")
    id3 = sql("SELECT id FROM ofertas WHERE hash_dedupe='h3';")
    ejecutar_nodo(consultas, "Descartar oferta", id3, "comercio_sin_programa_afiliacion", "50", "100")
    comprobar(
        "oferta sin programa de afiliación descartada",
        sql("SELECT estado FROM ofertas WHERE hash_dedupe='h3';") == "descartada",
    )

    for hd, cat, score, precio, com in (("h1", "electronica", 88, 199.00, 2.00),
                                        ("h2", "informatica", 74, 99.90, 2.50)):
        oid = sql(f"SELECT id FROM ofertas WHERE hash_dedupe='{hd}';")
        ejecutar_nodo(
            consultas, "Guardar clasificación",
            oid, cat, "sub", "Sony", f"Producto {hd}", "Copy de prueba",
            "{oferta,test}", "chollo", "{}", str(score),
            json.dumps({"total": score}), "265.00", "240.00", "245.00", str(precio),
            "40.00", "24.9", "false", "true",
            f"https://www.awin1.com/cread.php?awinmid=1&clickref=o{oid}-cgeneral-abc123",
            f"https://n8n.test/webhook/r/{oid}", "awin", str(com),
            str(round(precio * com / 100, 2)), "clasificada", None,
            "2099-01-01T00:00:00Z",
        )
    comprobar(
        "2 ofertas clasificadas y monetizadas",
        sql("SELECT count(*) FROM ofertas WHERE estado='clasificada' AND url_afiliado IS NOT NULL;") == "2",
    )
    comprobar(
        "el SubID de atribución viaja en el enlace",
        "clickref=o" in sql("SELECT url_afiliado FROM ofertas WHERE hash_dedupe='h1';"),
    )

    # -- 3. Publicación ------------------------------------------------------
    print("\n· WF03 · selección con control de ruido")
    filas = [f for f in ejecutar_nodo(consultas, "Seleccionar ofertas a publicar").split("\n") if f]
    comprobar("selecciona las 2 clasificadas", len(filas) == 2, str(len(filas)))

    oid1 = sql("SELECT id FROM ofertas WHERE hash_dedupe='h1';")
    ejecutar_nodo(consultas, "Marcar como publicada", oid1, "@canal", "5551", "@canal")
    comprobar(
        "estado publicada + message_id",
        sql(f"SELECT estado||'/'||telegram_message_id FROM ofertas WHERE id={oid1};") == "publicada/5551",
    )
    comprobar(
        "publicación registrada",
        sql("SELECT count(*) FROM publicaciones;") == "1",
    )
    # El mismo comercio no se repite en 20 minutos
    sql("UPDATE ofertas SET dominio='amazon.es' WHERE hash_dedupe='h2';")
    filas = [f for f in ejecutar_nodo(consultas, "Seleccionar ofertas a publicar").split("\n") if f]
    comprobar("bloquea repetir comercio en 20 min", len(filas) == 0, str(len(filas)))
    sql("UPDATE ofertas SET dominio='pccomponentes.com' WHERE hash_dedupe='h2';")

    print("\n· WF03 · alertas personalizadas")
    sql("""INSERT INTO suscriptores (telegram_user_id, chat_id, nombre)
           VALUES (11111, '11111', 'Prueba');""")
    sql("""INSERT INTO alertas (suscriptor_id, texto, precio_max)
           SELECT id, 'auriculares sony', 300 FROM suscriptores WHERE telegram_user_id=11111;""")
    sql("""INSERT INTO alertas (suscriptor_id, texto, precio_max)
           SELECT id, 'auriculares sony', 100 FROM suscriptores WHERE telegram_user_id=11111;""")
    filas = [f for f in ejecutar_nodo(
        consultas, "Buscar alertas coincidentes",
        oid1, "Auriculares Sony WH-1000XM5", "electronica", "199.00", "24.9").split("\n") if f]
    comprobar("casa la alerta cuyo precio máximo se cumple", len(filas) == 1, str(filas))

    alerta_id = filas[0].split("|")[0]
    ejecutar_nodo(consultas, "Registrar envío de alerta", alerta_id, oid1)
    filas = [f for f in ejecutar_nodo(
        consultas, "Buscar alertas coincidentes",
        oid1, "Auriculares Sony WH-1000XM5", "electronica", "199.00", "24.9").split("\n") if f]
    comprobar("no repite el aviso de la misma oferta", len(filas) == 0, str(filas))

    # -- 4. Bot --------------------------------------------------------------
    print("\n· WF04 · comandos del bot")
    ejecutar_nodo(consultas, "Alta de suscriptor", "22222", "22222", "Nuevo")
    comprobar("alta idempotente", sql("SELECT count(*) FROM suscriptores;") == "2")
    r = ejecutar_nodo(consultas, "Crear alerta", "22222", "22222", "Nuevo", "portátil", "600")
    comprobar("alerta creada con precio máximo", "|600" in r.replace(".00", ""), r)
    r = ejecutar_nodo(consultas, "Listar alertas", "22222")
    comprobar("lista las alertas del usuario", len([x for x in r.split("\n") if x]) == 1, r)
    r = ejecutar_nodo(consultas, "Top 24 h")
    comprobar("top devuelve la publicada", len([x for x in r.split("\n") if x]) == 1, r)
    r = ejecutar_nodo(consultas, "Buscar publicadas", "auriculares sony")
    comprobar("búsqueda difusa encuentra el producto (busca en el título original)",
              len([x for x in r.split("\n") if x]) == 1, r)
    r = ejecutar_nodo(consultas, "Buscar publicadas", "bicicleta de montaña")
    comprobar("búsqueda sin coincidencias devuelve vacío",
              len([x for x in r.split("\n") if x]) == 0, r)
    r = ejecutar_nodo(consultas, "Serie de precios", oid1)
    comprobar("serie de precios no vacía", len([x for x in r.split("\n") if x]) > 10, r[:80])
    r = ejecutar_nodo(consultas, "Alerta desde botón", "22222", "22222", "Nuevo", oid1)
    comprobar("botón crea alerta a partir del título", "Producto h1" in r, r)
    ejecutar_nodo(consultas, "Dar de baja", "22222")
    comprobar(
        "baja desactiva al suscriptor",
        sql("SELECT activo FROM suscriptores WHERE telegram_user_id=22222;") == "f",
    )

    # -- 5. Atribución -------------------------------------------------------
    print("\n· WF06 · clic, postback y EPC")
    subid = f"o{oid1}-cgeneral-abc123"
    ejecutar_nodo(consultas, "Registrar clic", oid1, subid, "general", "hash123", None)
    ejecutar_nodo(consultas, "Registrar clic", oid1, subid + "b", "general", "hash124", None)
    comprobar("2 clics registrados", sql("SELECT count(*) FROM clicks;") == "2")

    ejecutar_nodo(consultas, "Guardar conversión", "awin", "TX-1", subid, oid1,
                  "199.00", "3.98", "2.00", "pendiente")
    ejecutar_nodo(consultas, "Guardar conversión", "awin", "TX-1", subid, oid1,
                  "199.00", "3.98", "2.00", "aprobada")
    comprobar("postback idempotente y actualiza estado",
              sql("SELECT count(*)||'/'||max(estado) FROM conversiones;") == "1/aprobada")

    r = sql(f"SELECT clics, ventas, comision_real, epc, tasa_conversion_pct "
            f"FROM v_rendimiento_ofertas WHERE id={oid1};")
    clics, ventas, comision, epc, cr = r.split("|")
    comprobar("vista de rendimiento: EPC y conversión",
              clics == "2" and ventas == "1" and float(epc) == 1.99 and float(cr) == 50.0, r)

    # -- 6. Vigencia ---------------------------------------------------------
    print("\n· WF05 · vigencia e informe")
    filas = [f for f in ejecutar_nodo(consultas, "Publicadas a revisar").split("\n") if f]
    comprobar("localiza publicadas pendientes de revisar", len(filas) == 1, str(len(filas)))
    ejecutar_nodo(consultas, "Actualizar estado", oid1, "true", "true", "289.00")
    comprobar("marca caducada y actualiza precio",
              sql(f"SELECT estado||'/'||precio_actual||'/'||stock FROM ofertas WHERE id={oid1};")
              == "caducada/289.00/false")
    filas = [f for f in ejecutar_nodo(consultas, "Publicadas a revisar").split("\n") if f]
    comprobar("no revisa dos veces en 2 h", len(filas) == 0, str(len(filas)))
    r = ejecutar_nodo(consultas, "Métricas del día")
    comprobar("informe diario produce métricas", r.count("|") >= 12, r[:120])

    # -- resultado -----------------------------------------------------------
    print()
    if fallos:
        print(f"❌ {len(fallos)} comprobación(es) fallidas:")
        for f in fallos:
            print("   -", f)
        sys.exit(1)
    print("✅ Todas las comprobaciones pasan.")


if __name__ == "__main__":
    main()
