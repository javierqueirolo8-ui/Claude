#!/usr/bin/env bash
# ============================================================================
#  Verificación completa del núcleo de cobranza asistida.
#
#    · sintaxis de todos los archivos JavaScript
#    · ejemplos y demostración al día con el código
#    · el paquete para n8n (n8n/dist) al día con las fuentes, y la batería completa pasando contra ESE código
#    · los flujos de n8n de la Etapa 2 (shell y utilidades) al día con sus generadores
#    · todas las pruebas, repetidas con seis zonas horarias distintas: las fechas
#      son lo primero que se rompe fuera de la zona del autor
#    · (opcional) pasada profunda con muchas más semillas al azar
#    · (si hay Playwright) el informe de demostración en un Chromium real
#    · (opcional) pruebas de mutación del núcleo y de los generadores de los flujos de n8n: se rompen
#      reglas a propósito y las pruebas tienen que darse cuenta
#
#  Uso:  ./verificar.sh                  verificación normal (segundos)
#        ./verificar.sh --profundo       además, 10 veces más casos al azar
#        ./verificar.sh --mutaciones     además, las pruebas de mutación (varios minutos)
#        ./verificar.sh --todo           todo lo anterior
#  Requiere: node 20 o superior. Para la prueba de navegador: npm i -g playwright
#  No usa red, no lee datos reales y no envía nada.
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

PROFUNDO=0
MUTACIONES=0
for arg in "$@"; do
  case "$arg" in
    --profundo) PROFUNDO=1 ;;
    --mutaciones) MUTACIONES=1 ;;
    --todo) PROFUNDO=1; MUTACIONES=1 ;;
    *) echo "Opción desconocida: $arg (usar --profundo, --mutaciones o --todo)"; exit 2 ;;
  esac
done

echo "▸ Sintaxis"
for f in src/*.js tests/*.js datos-ficticios/*.js demo/*.js n8n/*.js doc/*.js mutaciones.js; do
  node --check "$f" || { echo "✗ error de sintaxis en $f"; exit 1; }
done
echo "  ✓ $(ls src/*.js tests/*.js datos-ficticios/*.js demo/*.js n8n/*.js doc/*.js mutaciones.js | wc -l | tr -d ' ') archivos"

echo
echo "▸ Demostración y ejemplos al día con el código"
node demo/generar-demo.js --verificar > /dev/null || { node demo/generar-demo.js --verificar; exit 1; }
echo "  ✓ sin diferencias"

echo
echo "▸ Pruebas, en seis zonas horarias"
for tz in America/Montevideo Europe/Madrid UTC Pacific/Kiritimati America/Los_Angeles Pacific/Pago_Pago; do
  printf '  %-22s' "$tz"
  if ! salida=$(TZ="$tz" node --test tests/*.test.js 2>&1); then
    echo "✗"
    echo "$salida" | grep -E "^not ok|^# (tests|pass|fail)" | head -40
    exit 1
  fi
  echo "✓ $(echo "$salida" | awk '/^# pass/ {print $3}') pruebas"
done

echo
echo "▸ Paquete para n8n (lo que de verdad se ejecuta)"
node n8n/probar-paquete.js || exit 1

echo
echo "▸ Flujos de n8n de la Etapa 2 (lo que se sube al servidor) al día con sus generadores"
for g in generar-shell generar-utilidades; do
  node "n8n/$g.js" --verificar > /dev/null || { node "n8n/$g.js" --verificar; exit 1; }
done
echo "  ✓ shell y utilidades sin diferencias (que el servidor tenga lo mismo se comprueba con n8n/comparar-despliegue.js)"

if [ "$PROFUNDO" = "1" ]; then
  echo
  echo "▸ Pasada profunda (10 veces más casos al azar)"
  if ! salida=$(SEMILLAS=10 TZ=America/Montevideo node --test tests/*.test.js 2>&1); then
    echo "✗"
    echo "$salida" | grep -E "^not ok|^# (tests|pass|fail)" | head -40
    exit 1
  fi
  echo "  ✓ $(echo "$salida" | awk '/^# pass/ {print $3}') pruebas"
fi

echo
echo "▸ Informe de demostración en Chromium"
salida=$(node tests/navegador.js) || { echo "$salida"; exit 1; }
echo "$salida"

if [ "$MUTACIONES" = "1" ]; then
  echo
  echo "▸ Pruebas de mutación"
  node mutaciones.js || exit 1
  echo
  echo "▸ Pruebas de mutación de los generadores de los flujos de n8n"
  node n8n/mutaciones-flujos.js || exit 1
fi

echo
if echo "$salida" | grep -q "omitida"; then
  echo "✅ Verificación superada (la prueba de navegador se omitió: falta Playwright)."
else
  echo "✅ Verificación completa superada."
fi
