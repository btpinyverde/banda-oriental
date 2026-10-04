# Contrato de la API que necesita `/jugar`

El frontend de `/jugar` (`frontend/app/jugar/`, `frontend/app/lib/juego/`) ya está hecho y habla con la API
actual. Este documento lista **lo que falta en el backend** para que funcione sin la demo. No se tocó el backend.

Los tipos exactos están en `frontend/app/lib/juego/tipos.ts`; el cliente real, en `cliente-http.ts`.

## Lo que ya existe y el frontend usa tal cual

| Endpoint | Uso |
|---|---|
| `GET /api/daily/` | Estado del día. Header `X-Device-Id` (UUID). 404 si no hay canción publicada. |
| `POST /api/daily/guess/` | Cuerpo `{attempt_number, song_id}`. Devuelve `is_correct`, `feedback`, `finished`, `attempts_remaining`. |
| `POST /api/daily/score/` | Cuerpo `{display_name, total_time_seconds}`. `display_name` de 1 a 50 caracteres. |

## Lo que falta

1. **`GET /api/songs/`** (hecho en la rama `feat/backend-songs-endpoint`, pendiente de publicar) → `{ "songs": [{ "id", "title", "artist", "album", "year", "genre" }] }`.
   Sin el catálogo el buscador no tiene qué ofrecer, y `guess` necesita el `song_id`. **Es lo que bloquea publicar `/jugar`.**
   El frontend no debe recibir cuál es la canción del día por este endpoint.
2. **CORS**: permitir el header `X-Device-Id` desde el dominio del sitio (y `Content-Type`).
3. **Canción del día publicada**, con stems y mezclas acumulativas: el frontend reproduce la **última** pista
   desbloqueada (`unlocked_stems` ordenadas por `unlock_order`), así que cada una debe contener a las anteriores.
   Hay 4 pistas (batería, bajo, otros, voz) y 6 intentos: del intento 4 en adelante la pista no cambia.
4. **Opcionales** (hoy el frontend se las arregla sin ellas):
   - `number` (nº del juego, "#138") en `GET /api/daily/`. Sin él muestra la fecha corta ("3 oct").
   - `guessed_text` en cada `feedback_history[]`. Sin él, la tabla recuerda lo adivinado en el navegador
     (`localStorage`), y tras limpiar datos muestra "—" en esas filas.
   - Que el estado terminado incluya el historial de intentos, para mostrar la tabla al volver a entrar.

## Variables de entorno del frontend

- `NEXT_PUBLIC_API_BASE_URL`: URL base de la API. Vacía si se usa el proxy de desarrollo (abajo).
- `NEXT_PUBLIC_JUEGO_DEMO` (ignorada en builds de producción):
  - `1`: todo de ejemplo, sin red (`cliente-demo.ts`).
  - `catalogo-real`: canción del día de ejemplo, pero el buscador usa `GET /api/songs/` de la API. Sirve para
    probar la búsqueda sin canción del día publicada.
- `API_PROXY_TARGET` (solo desarrollo): ej. `https://banda-oriental-backend.onrender.com`. Next reenvía `/api/*`
  a esa API y no hace falta permitir `localhost` en el CORS del backend.

Los audios de la demo van en `frontend/public/demo/etapa-1..4.mp3` (ignorados por git).

Para probar localmente la búsqueda con el catálogo de producción:
`API_PROXY_TARGET=https://banda-oriental-backend.onrender.com NEXT_PUBLIC_JUEGO_DEMO=catalogo-real npm run dev`

## Pendiente de CORS para el juego real

`django-cors-headers` no permite por defecto el header `X-Device-Id` que usan `/api/daily/*`: hay que sumarlo a
`CORS_ALLOW_HEADERS` (junto con los headers por defecto) y permitir el dominio del sitio en `CORS_ALLOWED_ORIGINS`.
`GET /api/songs/` no usa ese header.

## Compartir el resultado (imagen para stories)

El front genera la imagen en `GET /compartir/story` (1080 × 1920) a partir de los datos del link. La versión **oculta**
(cuadrícula de colores e intentos) solo se ofrece con los colores de los intentos que se guardan en el dispositivo
al jugar. La versión **revelada** (con la canción) solo se ofrece para días que ya pasaron. Para completarla, el
backend debería sumar, en el estado de un día terminado (`GET /api/daily/`):

- `song.year`, `song.cover_art_url` y el usuario de Instagram del artista (`artist.instagram_handle`): hoy la tarjeta
  de la canción lleva título, artista y disco, y un cuadrado con una nota musical en lugar de la tapa.
- `feedback_history` (los colores de cada intento) también cuando el día ya terminó: sin eso, si alguien recarga la
  página al terminar, no hay con qué dibujar la cuadrícula.

## Maqueta de la columna derecha

La columna de racha, estadísticas, "compartir resultado" y ranking del día (`ColumnaLateralEjemplo.tsx`) usa
datos inventados y solo se muestra en modo demo. Para activarla de verdad hacen falta endpoints de racha,
estadísticas y ranking (hoy existe `GET /api/leaderboard/today/`) y cuentas o un identificador de jugador.

## Fuera de alcance por ahora

Racha, estadísticas, ranking del día, compartir resultado, cuentas/perfil.
