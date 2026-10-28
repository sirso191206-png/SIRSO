#!/bin/bash
# SIRO — Respaldo diario, paso 3 (contenedor postgres:17.6-bookworm, SIN red): empaqueta /trabajo y lo cifra con AES-256 (gpg simétrico).
# Montajes: /trabajo (solo lectura), /clave (solo lectura: clave_respaldo.txt), /salida. Uso: cifrar.sh <nombre_base>
set -euo pipefail
NOMBRE="${1:?nombre}"
[ -s /clave/clave_respaldo.txt ] || { echo "ERROR: falta la clave de cifrado"; exit 2; }
tar -czf - -C /trabajo . | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file /clave/clave_respaldo.txt \
  --symmetric --cipher-algo AES256 --compress-algo none -o "/salida/$NOMBRE.tar.gz.gpg"
( cd /salida && sha256sum "$NOMBRE.tar.gz.gpg" > "$NOMBRE.tar.gz.gpg.sha256" )
echo "cifrado OK: $(stat -c %s "/salida/$NOMBRE.tar.gz.gpg") bytes"
