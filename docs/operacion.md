# Operación de Banda Oriental: qué corre, qué configurar y qué hacer si algo falla

Una página para quien opere el juego (hoy, Brandon). Complementa `docs/seguridad-y-abuso.md`, `docs/activar-correo.md` y
`docs/lanzamiento-juego.md`.

## Dónde vive cada cosa

| Parte | Dónde | Notas |
|---|---|---|
| Sitio (Next.js) | Vercel, `bandaoriental.xami.uy` | Se despliega solo al mergear a `main`. |
| API (Django) | Render (plan gratuito), `api.bandaoriental.xami.uy` | Se duerme sin visitas: la primera tarda hasta ~50 s. |
| Base de datos | Neon (Postgres) | Guarda partidas, puntajes, estadísticas y cuentas. |
| Audios | Cloudflare R2, bucket `banda-oriental-stems` | Direcciones firmadas de 1 hora. |
| Correo | Resend, dominio `bandaoriental.xami.uy` | Remitente `hola@bandaoriental.xami.uy`. |
| DNS | Antel Data (nic.com.uy) | Los registros del correo van bajo `bandaoriental`, sin tocar el SPF de Zoho. |
| Comprobación humana | Cloudflare Turnstile | Apagada si no hay `TURNSTILE_SECRET_KEY` en Render. |

## Variables de entorno

**Render (API)**: `DATABASE_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, claves de R2, `FRONTEND_URL`
(`https://bandaoriental.xami.uy`), `RESEND_API_KEY`, `DEFAULT_FROM_EMAIL`, `TURNSTILE_SECRET_KEY` (opcional),
`REPLY_TO_EMAIL` (casilla real a la que llegan las respuestas a los correos de la cuenta; ver `docs/entregabilidad-del-correo.md`), `PURGE_ANONYMOUS_AFTER_DAYS` (7 por defecto; `0` apaga el borrado de anónimos).

**Vercel (sitio)**: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_CUENTAS_ACTIVAS=1` (cuentas visibles),
`NEXT_PUBLIC_BATALLA_ACTIVA=1` (muestra el modo batalla; apagado por defecto: sin la variable no aparece nada de él),
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` (clave pública de Turnstile).

Las claves secretas (`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, R2, `DATABASE_URL`) las carga siempre el dueño a mano;
nunca van al chat, al repositorio ni a una captura.

## Estadísticas, rankings y anónimos

- Las estadísticas de cada jugador (cuenta o dispositivo) las calcula y guarda el servidor al terminar cada partida,
  desde los intentos y puntajes que validó. Ninguna ruta acepta estadísticas del cliente.
- `python manage.py recompute_stats`: reconstruye las de todos. Corre en cada despliegue (`render.yaml`). Si algún día
  hay muchos miles de jugadores, sacarlo del despliegue y dejarlo como comando puntual.
- `python manage.py purge_inactive_anonymous --days 7 --dry-run`: muestra qué se borraría (sin borrar). Sin
  `--dry-run` borra los anónimos que no juegan hace N días (intentos, puntajes, estadísticas). Nunca toca cuentas ni lo
  que un dispositivo ya le pasó a una cuenta. Corre solo una vez al día, con la primera visita.
- Rankings: `GET /api/leaderboard/?period=day|week|month|all`. Semana de lunes a domingo, mes calendario, hora de
  Uruguay.

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| Nadie puede adivinar ("no pudimos comprobar que sos una persona") | Render → Logs: buscar `Turnstile rechazó`. `invalid-input-secret` = la clave secreta está mal. Salida de emergencia: borrar `TURNSTILE_SECRET_KEY` en Render. |
| No llegan los correos | Resend → Emails (¿"Delivered"?) y Domains (¿"Verified"?). Render → Logs: "No se pudo enviar el correo". |
| La API tarda ~1 minuto | Es el plan gratuito durmiendo. Un monitor gratuito que la consulte cada pocos minutos lo evita. |
| "Límite de pedidos alcanzado" en los logs | Alguien insiste desde una IP; ver `docs/seguridad-y-abuso.md`. |
| Un nombre del ranking ofensivo | Django admin → Player stats: borrar el nombre público (queda libre). |

## Respaldo del histórico (pendiente)

El plan gratuito de Neon conserva poco historial de restauración. Antes de abrir al público conviene un respaldo
periódico (por ejemplo, un `pg_dump` semanal guardado fuera de Neon). Necesita la `DATABASE_URL`, que la tiene que
cargar el dueño.

## Ver y probar los rankings en producción

`manage.py ranking_prueba` mira lo que hay (puntajes guardados, días publicados y cada ranking como lo arma la API). Con
`--crear` agrega puntajes de prueba marcados (`[prueba] Ana`...) a los últimos días publicados, y con `--borrar` quita
exactamente esos (se reconocen por un identificador fijo de dispositivo, no por el nombre: nunca toca los de verdad). Se
corre desde tu compu contra la base de producción, como el cargador del catálogo:

    cd backend
    export DATABASE_URL='postgres://...'   # la URL de Neon
    export DJANGO_SETTINGS_MODULE=config.settings.prod SECRET_KEY=local ALLOWED_HOSTS=localhost \
      CORS_ALLOWED_ORIGINS=https://bandaoriental.xami.uy R2_ACCESS_KEY_ID=x R2_SECRET_ACCESS_KEY=x R2_BUCKET_NAME=x R2_ENDPOINT_URL=https://x.example.com
    .venv/bin/python manage.py ranking_prueba            # solo mirar
    .venv/bin/python manage.py ranking_prueba --crear    # agrega datos de prueba
    .venv/bin/python manage.py ranking_prueba --borrar   # los quita

## Completar y limpiar el catálogo

Todo se corre desde tu compu contra la base de producción, con el mismo entorno que `ranking_prueba` (ver arriba). Orden:

1. **Cargar lo que falta**: `scripts/cargar-catalogo.sh` (MusicBrainz) y después `manage.py sync_deezer --dry-run --limit 20`
   para ver qué haría y `manage.py sync_deezer` de verdad. Deezer completa de los discos que ya existen el género, el año, la
   portada y la duración (sin pisar lo que ya hay) y trae discos y canciones que falten.
2. **Mirar cómo quedó**: `manage.py catalog_report` (solo lectura): cuántos discos sin género, año o portada, canciones sin
   duración, artistas sin discos o sin emparejar con Deezer, repetidas, clásica y géneros escritos de varias formas.
3. **Limpiar**: `manage.py clean_catalog --duplicadas --clasica --generos` **solo informa** (modo prueba) y da ejemplos. Con
   `--aplicar` lo hace. Opciones: `--inferir-genero` (a un disco sin género le pone el que tiene casi todo su artista),
   `--restaurar` (vuelve a mostrar lo que ocultó este comando; lo ocultado a mano no se toca).

`clean_catalog` **no borra nada**: oculta (`Song.hidden`) las canciones repetidas (mismo artista y título en varios discos: queda
la del disco completo más antiguo y con más datos) y las de discos de música clásica, y no toca nunca una canción de un día jugado
o programado. Las canciones ocultas salen del buscador del juego, del archivo y de los conteos, pero siguen en la base y los
importadores las siguen reconociendo (no vuelven como nuevas). Correlo **después** de `sync_deezer`, cuando ya esté todo cargado.

### Todo con un solo script

`scripts/catalogo.sh <paso>` hace lo de arriba (y lo de ranking) sin armar el entorno a mano. Hace falta solo `DATABASE_URL`.
Pasos: `reporte`, `deezer-prueba`, `deezer`, `limpiar`, `limpiar-aplicar`, `deshacer-limpieza`, `ranking`,
`ranking-crear`, `ranking-borrar`. La carga de MusicBrainz no está en este script: es la de `scripts/cargar-catalogo.sh`. Muestra a qué base va a escribir, y los pasos que cambian datos piden confirmación.

