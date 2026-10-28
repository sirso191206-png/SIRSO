#!/bin/bash
# SIRO — Restauración de prueba, paso A (contenedor postgres:17.6-bookworm, SIN red): comprueba el SHA-256 del archivo cifrado y lo
# descifra en un volumen temporal de Docker (/v), que se borra al terminar. Uso: descifrar.sh <archivo.tar.gz.gpg>
set -euo pipefail
ARCHIVO="${1:?archivo}"
( cd /salida && sha256sum -c "$ARCHIVO.sha256" >/dev/null ) || { echo "ERROR: el SHA-256 del respaldo no coincide"; exit 3; }
gpg --batch --quiet --pinentry-mode loopback --passphrase-file /clave/clave_respaldo.txt -d "/salida/$ARCHIVO" | tar -xzf - -C /v
chmod -R a+rX /v
echo "descifrado OK"
