#!/usr/bin/env bash
# Carga el catálogo completo (artistas, discos y canciones uruguayos) desde MusicBrainz en la base de
# producción, corriendo desde tu compu: sin el límite de 30 s de gunicorn en Render.
#
# Uso:
#   export DATABASE_URL='postgres://...'   # la URL de conexión de Neon
#   ./scripts/cargar-catalogo.sh [--sin-portadas]
#
# Muestra cada artista, cada disco y los totales a medida que avanza. Se puede cortar con Ctrl+C y volver
# a correr: sigue desde el último artista y no duplica nada.
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL (la URL de conexión de la base de producción)}"

cd "$(dirname "$0")/.."

# Ajustes mínimos para cargar config.settings.prod. El importador no usa R2 ni sirve páginas:
# estos valores son de relleno. Lo único real es DATABASE_URL.
export DJANGO_SETTINGS_MODULE=config.settings.prod
export SECRET_KEY="${SECRET_KEY:-importador-local}"
export ALLOWED_HOSTS="${ALLOWED_HOSTS:-localhost}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://bandaoriental.xami.uy}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-relleno}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-relleno}"
export R2_BUCKET_NAME="${R2_BUCKET_NAME:-relleno}"
export R2_ENDPOINT_URL="${R2_ENDPOINT_URL:-https://relleno.example.com}"

PYTHON="backend/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="python3"

host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@([^/?]+).*#\1#')"
echo "Se va a escribir en la base de: $host"
read -r -p "¿Seguir? (s/N) " respuesta
[ "$respuesta" = "s" ] || { echo "Cancelado."; exit 1; }

exec "$PYTHON" -u scripts/cargar_catalogo.py "$@"
