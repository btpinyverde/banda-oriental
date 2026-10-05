#!/usr/bin/env bash
# Un solo comando para completar, mirar y limpiar el catálogo (y mirar los rankings) en la base de producción,
# corriendo desde tu compu. Muestra a qué base va a escribir y pide confirmación antes de tocar nada.
#
# Uso:
#   export DATABASE_URL='postgres://...'   # la URL de conexión de Neon
#   ./scripts/catalogo.sh <paso>
#
# Pasos, en este orden:
#   reporte          mira cuánto falta (solo lectura)
#   cargar           trae artistas, discos y canciones de MusicBrainz (se puede cortar con Ctrl+C y seguir)
#   deezer-prueba    prueba Deezer con 20 artistas SIN guardar nada
#   deezer           completa género, año, portada y duración desde Deezer (tarda; se puede cortar y seguir)
#   limpiar          dice qué ocultaría (repetidas, clásica, géneros) SIN cambiar nada
#   limpiar-aplicar  lo hace de verdad (oculta, no borra)
#   deshacer-limpieza   vuelve a mostrar lo que ocultó limpiar-aplicar
#   ranking          mira los puntajes y los rankings, y cuántos ganaron sin guardar
#   ranking-crear    agrega puntajes de prueba marcados [prueba]
#   ranking-borrar   quita exactamente esos puntajes de prueba
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL (la URL de conexión de la base de producción)}"
paso="${1:-}"
[ -n "$paso" ] || { sed -n '2,22p' "$0"; exit 1; }

cd "$(dirname "$0")/.."

# Ajustes mínimos para cargar config.settings.prod. Estos comandos no usan R2 ni sirven páginas:
# los valores de relleno no se usan. Lo único real es DATABASE_URL.
export DJANGO_SETTINGS_MODULE=config.settings.prod
export SECRET_KEY="${SECRET_KEY:-importador-local}"
export ALLOWED_HOSTS="${ALLOWED_HOSTS:-localhost}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://bandaoriental.xami.uy}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-relleno}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-relleno}"
export R2_BUCKET_NAME="${R2_BUCKET_NAME:-relleno}"
export R2_ENDPOINT_URL="${R2_ENDPOINT_URL:-https://relleno.example.com}"

PYTHON="$(pwd)/backend/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="python3"
manage() { (cd backend && "$PYTHON" -u manage.py "$@"); }

host="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@([^/?]+).*#\1#')"
echo "Base de datos: $host"

# Los pasos que cambian datos piden confirmación; los de solo lectura y las pruebas, no.
confirmar() {
  read -r -p "Esto cambia datos en esa base. ¿Seguir? (s/N) " respuesta
  [ "$respuesta" = "s" ] || { echo "Cancelado."; exit 1; }
}

case "$paso" in
  reporte)          manage catalog_report ;;
  cargar)           confirmar; exec "$PYTHON" -u scripts/cargar_catalogo.py ;;
  deezer-prueba)    manage sync_deezer --dry-run --limit 20 ;;
  deezer)           confirmar; manage sync_deezer ;;
  limpiar)          manage clean_catalog --duplicadas --clasica --generos ;;
  limpiar-aplicar)  confirmar; manage clean_catalog --duplicadas --clasica --generos --aplicar ;;
  deshacer-limpieza) confirmar; manage clean_catalog --restaurar --aplicar ;;
  ranking)          manage ranking_prueba ;;
  ranking-crear)    confirmar; manage ranking_prueba --crear ;;
  ranking-borrar)   confirmar; manage ranking_prueba --borrar ;;
  *) echo "Paso desconocido: $paso"; sed -n '2,22p' "$0"; exit 1 ;;
esac
