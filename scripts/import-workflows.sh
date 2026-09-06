#!/usr/bin/env bash
# ============================================================================
#  Importa los 6 workflows en la instancia de n8n.
#
#  Uso:
#    ./scripts/import-workflows.sh                 # contenedor docker (por defecto)
#    N8N_MODE=api ./scripts/import-workflows.sh    # vía API REST
#
#  Tras importar hay que asignar las credenciales a mano en la UI:
#  Postgres ChollosBot · Telegram ChollosBot · Anthropic API (x-api-key)
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODO="${N8N_MODE:-docker}"
CONTENEDOR="${N8N_CONTAINER:-chollos-n8n}"
API_URL="${N8N_API_URL:-http://localhost:5678}"

cd "$RAIZ"

if [[ ! -d n8n/workflows ]] || ! ls n8n/workflows/*.json >/dev/null 2>&1; then
  echo "No hay workflows generados. Ejecuta primero: python3 tools/build_workflows.py" >&2
  exit 1
fi

case "$MODO" in
  docker)
    if ! docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then
      echo "El contenedor '$CONTENEDOR' no está en marcha. Arranca con: docker compose up -d" >&2
      exit 1
    fi
    echo "Importando en el contenedor $CONTENEDOR…"
    # El compose monta ./n8n/workflows en /workflows (solo lectura)
    docker exec "$CONTENEDOR" n8n import:workflow --separate --input=/workflows
    echo
    echo "Importados. Pasos siguientes en http://localhost:5678 :"
    ;;

  api)
    : "${N8N_API_KEY:?Define N8N_API_KEY (Ajustes -> n8n API -> Create an API key)}"
    for f in n8n/workflows/*.json; do
      nombre=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['name'])" "$f")
      # La API rechaza campos de solo lectura: se envía únicamente lo aceptado
      cuerpo=$(python3 - "$f" <<'PY'
import json, sys
w = json.load(open(sys.argv[1]))
print(json.dumps({k: w[k] for k in ("name", "nodes", "connections", "settings")}))
PY
)
      codigo=$(curl -sS -o /tmp/n8n-import.out -w '%{http_code}' \
        -X POST "$API_URL/api/v1/workflows" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H 'Content-Type: application/json' \
        --data "$cuerpo")
      if [[ "$codigo" =~ ^2 ]]; then
        echo "  ✓ $nombre"
      else
        echo "  ✗ $nombre (HTTP $codigo)"; head -c 300 /tmp/n8n-import.out; echo
      fi
    done
    ;;

  *)
    echo "N8N_MODE debe ser 'docker' o 'api'" >&2; exit 1 ;;
esac

cat <<'FIN'

  1. Credentials -> crea y asigna:
       · Postgres ChollosBot        (host: postgres, base: chollos, esquema: public)
       · Telegram ChollosBot        (token del bot)
       · Anthropic API (x-api-key)  (Header Auth · nombre: x-api-key)
  2. Abre "ChollosBot 04" y guarda: registra el webhook del bot en Telegram.
  3. Activa los workflows 01, 02, 03, 04, 05 y 06.
  4. Comprueba el redirector:  curl -I "$PUBLIC_BASE_URL/webhook/r/1"
FIN
