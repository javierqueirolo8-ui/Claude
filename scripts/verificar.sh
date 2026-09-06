#!/usr/bin/env bash
# ============================================================================
#  Verificación completa del repositorio:
#    · JSON de los workflows bien formados y conexiones coherentes
#    · sintaxis de todo el JavaScript embebido (nodos Code y expresiones)
#    · el SQL del esquema y de los 29 nodos Postgres, contra un PostgreSQL real
#    · prueba funcional del flujo de datos de extremo a extremo
#
#  Uso:  ./scripts/verificar.sh
#  Requiere: python3, node, y psql + initdb (postgresql-16) o CHOLLOS_DSN.
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

echo "▸ Regenerando workflows"
python3 tools/build_workflows.py

echo
echo "▸ Validando estructura JSON y conexiones"
python3 - <<'PY'
import json, glob, sys
fallos = 0
for f in sorted(glob.glob('n8n/workflows/*.json')):
    w = json.load(open(f))
    nombres = {n['name'] for n in w['nodes']}
    for origen, v in w['connections'].items():
        objetivos = [d['node'] for salida in v['main'] for d in salida]
        for x in [origen] + objetivos:
            if x not in nombres:
                print(f'  ✗ {f}: conexión a nodo inexistente «{x}»'); fallos += 1
    print(f"  ✓ {f.split('/')[-1]}  {len(w['nodes'])} nodos")
sys.exit(1 if fallos else 0)
PY

echo
echo "▸ Comprobando sintaxis JavaScript"
python3 - <<'PY'
import json, glob, subprocess, tempfile, os, re, sys
pat = re.compile(r'\{\{(.+?)\}\}', re.S)
fallos = nodos = expr = 0

def check(src, etiqueta):
    global fallos
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as t:
        t.write(src); p = t.name
    r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
    os.unlink(p)
    if r.returncode:
        print('  ✗', etiqueta); print('   ', r.stderr.strip().split('\n')[0][:200]); fallos += 1

def recorrer(v, f, nombre):
    global expr
    if isinstance(v, str) and v.startswith('='):
        for m in pat.finditer(v):
            expr += 1
            check("(function($json,$env,$){ return (" + m.group(1) + "); })", f'{f} · {nombre} · expresión')
    elif isinstance(v, dict):
        for x in v.values(): recorrer(x, f, nombre)
    elif isinstance(v, list):
        for x in v: recorrer(x, f, nombre)

for f in sorted(glob.glob('n8n/workflows/*.json')):
    for n in json.load(open(f))['nodes']:
        js = n['parameters'].get('jsCode')
        if js:
            nodos += 1
            check("(async function(){\n" + js + "\n})", f"{f} · {n['name']}")
        recorrer(n['parameters'], f.split('/')[-1], n['name'])
print(f'  ✓ {nodos} nodos Code y {expr} expresiones comprobadas')
sys.exit(1 if fallos else 0)
PY

# --- PostgreSQL efímero si no se indica uno existente -----------------------
LIMPIAR=0
if [[ -z "${CHOLLOS_DSN:-}" ]]; then
  BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)
  if [[ -z "$BIN" ]]; then
    echo; echo "▸ Sin PostgreSQL local: se omiten las pruebas de SQL."
    echo "  Instala postgresql o define CHOLLOS_DSN para ejecutarlas."
    exit 0
  fi
  D="${TMPDIR:-/var/tmp}/chollos-pgdata-$$"
  echo; echo "▸ Arrancando PostgreSQL efímero en $D"
  mkdir -p "$D"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown postgres:postgres "$D"; chmod 700 "$D"
    EJEC=(su postgres -c)
  else
    EJEC=(bash -c)
  fi
  "${EJEC[@]}" "$BIN/initdb -D $D -U postgres --auth=trust -E UTF8" >/dev/null 2>&1
  "${EJEC[@]}" "$BIN/pg_ctl -D $D -o '-p 55432 -k /tmp' -l $D/pg.log start" >/dev/null
  sleep 2
  export CHOLLOS_DSN="postgresql://postgres@/chollos?host=/tmp&port=55432"
  psql "postgresql://postgres@/postgres?host=/tmp&port=55432" -q -c "CREATE DATABASE chollos" >/dev/null
  LIMPIAR=1
  trap '"${EJEC[@]}" "'"$BIN"'/pg_ctl -D '"$D"' stop -m immediate" >/dev/null 2>&1; rm -rf "'"$D"'"' EXIT
fi

echo
echo "▸ Aplicando esquema y datos iniciales"
psql "$CHOLLOS_DSN" -v ON_ERROR_STOP=1 -q -f db/schema.sql
psql "$CHOLLOS_DSN" -v ON_ERROR_STOP=1 -q -f db/seed.sql
echo "  ✓ db/schema.sql y db/seed.sql aplicados"

echo
echo "▸ Validando el SQL de cada nodo Postgres"
python3 - <<'PY'
import json, glob, subprocess, os, sys
DSN = os.environ['CHOLLOS_DSN']
fallos = total = 0
for f in sorted(glob.glob('n8n/workflows/*.json')):
    for n in json.load(open(f))['nodes']:
        q = n['parameters'].get('query')
        if not q: continue
        total += 1
        cuerpo = ("BEGIN; PREPARE _v AS " + q.rstrip().rstrip(';') + "; ROLLBACK;"
                  if q.count(';') <= 1 else "BEGIN; " + q + " ROLLBACK;")
        r = subprocess.run(['psql', DSN, '-v', 'ON_ERROR_STOP=1', '-q', '-c', cuerpo],
                           capture_output=True, text=True)
        if r.returncode:
            fallos += 1
            print('  ✗', n['name']); print('   ', r.stderr.strip().split('\n')[0][:200])
print(f'  ✓ {total - fallos}/{total} consultas válidas')
sys.exit(1 if fallos else 0)
PY

echo
echo "▸ Prueba funcional del flujo de datos"
python3 tests/test_flujo_datos.py

echo
echo "✅ Verificación completa superada."
