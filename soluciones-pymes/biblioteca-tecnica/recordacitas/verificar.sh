#!/usr/bin/env bash
# ============================================================================
#  Verificación de RecordaCitas:
#    · pruebas del núcleo (fechas, horas, teléfonos, tablas, mensajes, enlaces)
#      y garantías de privacidad y seguridad, repetidas con seis zonas horarias
#      distintas: las fechas son lo primero que se rompe fuera de la zona del autor
#    · prueba de extremo a extremo en un Chromium real (Playwright), si está
#
#  Uso:  ./verificar.sh
#  Requiere: node 20 o superior. Para la prueba de navegador: npm i -g playwright
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

echo "▸ Pruebas del núcleo y garantías, en seis zonas horarias"
for tz in America/Montevideo Europe/Madrid UTC Pacific/Kiritimati America/Los_Angeles Pacific/Pago_Pago; do
  printf '  %-22s' "$tz"
  if ! salida=$(TZ="$tz" node --test --test-reporter=spec tests/*.test.js 2>&1); then
    echo "✗"
    echo "$salida" | tail -60
    exit 1
  fi
  echo "✓ $(echo "$salida" | awk '/^ℹ pass/ {print $3}') pruebas"
done

echo
echo "▸ Prueba de extremo a extremo en Chromium"
salida=$(node tests/e2e.js) || { echo "$salida"; exit 1; }
echo "$salida"

echo
if echo "$salida" | grep -q "omitida"; then
  echo "✅ Pruebas del núcleo superadas (la de navegador se omitió: falta Playwright)."
else
  echo "✅ Verificación completa superada."
fi
