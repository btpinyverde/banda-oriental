# Banda Oriental

Juego diario de canciones uruguayas: una canción por día, que se va armando pista por pista (batería, bajo, otros, voz), con
pistas de año, género, artista y disco. Además tiene un **archivo de música uruguaya** (artistas, discos y canciones), **cuentas**
para llevar el historial a cualquier dispositivo, rankings, y las **batallas**: salas para competir con otras personas, solas
o por equipos.

Backend en Django + DRF, frontend en Next.js (React + TypeScript). Sitio: <https://bandaoriental.xami.uy>.

## Qué hay

| Parte | Qué es | Más información |
|---|---|---|
| Juego diario | 6 intentos, pistas progresivas, puntaje por acierto y rapidez, historial y racha | `docs/contrato-api-jugar.md` |
| Rankings | Del día, la semana, el mes y de siempre; el servidor calcula y guarda todo | `docs/operacion.md` |
| Archivo de música | Buscar y explorar artistas, discos y canciones (catálogo de MusicBrainz y Deezer) | `docs/contrato-api-archivo.md` |
| Cuentas | Correo y contraseña o enlace por correo; el historial sin cuenta se une al crearla | `docs/contrato-api-cuentas.md`, `docs/activar-correo.md` |
| Batallas | Salas con enlace o QR, audio en cada dispositivo o solo en el anfitrión, aceptar gente, equipos, lista elegida o azar segmentado, enlaces de YouTube, modo presentación | `docs/contrato-api-batallas.md`, `docs/carga-batallas.md` |

Las batallas se ven en la landing, pero crear una sala está restringido: solo pueden las cuentas de `BATTLE_CREATOR_EMAILS` (a las
demás el sitio les dice que se está probando; entrar con el enlace de una sala está abierto). Para abrirlas a todos hace falta
`BATTLE_CREATOR_EMAILS=*` en la API. Para esconderlas de la landing, `NEXT_PUBLIC_BATALLA_ACTIVA=0` en el sitio.

## Estructura

```
backend/    Django + DRF (apps: catalog, gameplay, accounts, battles, core)
frontend/   Next.js (App Router)
docs/       contratos de la API, operación, seguridad y guías de lanzamiento
docs/superpowers/   diseños (specs) y planes de cada etapa
scripts/    carga del catálogo (catalogo.sh) y prueba de carga de las batallas
```

## Documentación

- `docs/operacion.md`: qué corre dónde, variables de entorno, qué hacer si algo falla.
- `docs/lanzamiento-juego.md`: lista de comprobación para salir a producción.
- `docs/seguridad-y-abuso.md`, `docs/entregabilidad-del-correo.md`: límites, comprobación humana y correo.
- `docs/superpowers/specs/`: el diseño original (2026-10-02) y los de cuentas y batallas. El original describe el MVP; lo que vino
  después (cuentas, archivo de música, batallas) está en los demás.

## Desarrollo local

### Backend

```bash
cd backend
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py runserver
```

Con `runserver` se usan los ajustes de desarrollo (SQLite). Con `gunicorn` hay que pasar
`DJANGO_SETTINGS_MODULE=config.settings.dev`: sin eso usa los de producción y pide `DATABASE_URL`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Para apuntar el sitio local a otra API sin tocar CORS: `API_PROXY_TARGET=https://… npm run dev` (con `NEXT_PUBLIC_API_BASE_URL` vacío).

### Test gate antes de pushear

Este repo no usa GitHub Actions (la cuenta lo tiene bloqueado; ver el diseño original, sección 13). En su lugar, un git hook
local corre los tests de backend y frontend, y el build del frontend, antes de cada `git push`. Para instalarlo una vez por clon:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
```

Si el hook falla, el push no sale: arreglá lo que rompió antes de reintentar.
