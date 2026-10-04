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
3. **Canción del día publicada**, con 4 pistas **sueltas** (un instrumento por archivo, no mezclas acumulativas): el
   frontend reproduce **todas las desbloqueadas a la vez** y dibuja la onda de la suma. El orden de desbloqueo lo
   define el backend por tipo, siempre el mismo: **batería (1), bajo (2), otros (3) y voz (4)**; el número
   `unlock_order` que se cargue en el admin no cambia el juego. Hay 6 intentos: del intento 4 en adelante no se suman
   más pistas. Los 4 archivos deben durar lo mismo y arrancar en el mismo instante (si no, no suenan alineados).
   Las `url` son firmadas (vencen a la hora); el frontend las identifica por día y tipo para no volver a bajarlas.
4. **CORS del bucket de audios (R2)**: el front baja los audios con `fetch` para mezclarlos y dibujar la onda, así
   que el bucket tiene que permitir `GET` y `HEAD` desde el dominio del sitio (política CORS de `banda-oriental-stems`).
   Sin eso el reproductor muestra "No se pudo reproducir el audio".
5. **Opcionales** (hoy el frontend se las arregla sin ellas):
   - `number` (nº del juego, "#138") en `GET /api/daily/`. Sin él muestra la fecha corta ("3 oct").
   - ~~`guessed_text` en cada `feedback_history[]`~~ (ya lo manda el backend, junto con `guessed_song`): en cada `feedback_history[]` llegan `guessed_text` y `guessed_song` (`id`, `title`, `artist`, `album`, `year`, `genre`, igual que `/api/songs/`, o `null` en intentos viejos). Así cualquier dispositivo de la cuenta puede dibujar la fila completa sin depender de lo guardado en el navegador.
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

## Estadísticas y nombre público (las calcula y guarda el servidor)

Racha, jugadas, aciertos, puntaje total y distribución las **calcula el servidor** a partir de los intentos y
puntajes que él mismo validó y las **guarda** (`PlayerStats`) cuando una partida termina (ganada o sexto intento
fallado). Ninguna API acepta estadísticas que mande el cliente: los campos extra de `POST /api/daily/score/` se
ignoran. Cada vez se recalcula desde los intentos, no se suma a un contador.

- Jugador = la cuenta (con sesión) o, mientras no hay cuenta, el dispositivo (`X-Device-Id`). Al crear la cuenta o
  entrar, las partidas del dispositivo pasan a la cuenta y las estadísticas se recalculan con todo junto: la racha
  que empezó sin cuenta sigue.
- Racha: se cuenta sobre los días que tuvieron canción publicada (un día sin canción no corta ni suma); un día
  publicado que no se jugó o se perdió la corta; el día de hoy todavía abierto no la corta.
- `GET /api/stats/` (sesión opcional + `X-Device-Id`): `public_name`, `played`, `won`, `win_percentage`,
  `current_streak`, `max_streak`, `total_score`, `average_attempts`, `distribution` (ganadas en 1…6 intentos),
  `last_played_day`. Solo lectura (otros métodos dan 405). Sin partidas: todo en cero y `public_name: null`.
- **Nombre público**: se elige una vez por jugador, con el primer `POST /api/daily/score/` (`display_name`). Es
  único sin distinguir mayúsculas (`400` "Ese nombre ya está en uso. Elegí otro."), pasa por el filtro de palabras y
  se conserva al crear la cuenta. Con nombre ya elegido, `display_name` es opcional y se ignora: el ranking muestra
  siempre el nombre guardado.
- **Tiempo del puntaje**: `total_time_seconds` nunca puede ser menor que lo que el servidor vio entre el primer
  intento y el ganador.
- `python manage.py recompute_stats` reconstruye las estadísticas de todos; corre en cada despliegue.

## Rankings

`GET /api/leaderboard/?period=day|week|month|all` (público, solo lectura; sesión o `X-Device-Id` opcionales).
Semana de lunes a domingo, mes calendario, en horario de Uruguay. Entran todos: una cuenta cuenta una sola vez sin
importar los dispositivos, y un dispositivo sin cuenta es un jugador más. Mismo puntaje, mismo puesto.

```
{ "period": "week", "from": "2026-10-05", "to": "2026-10-11",
  "entries": [ { "rank": 1, "display_name": "Ana", "score": 1850, "games": 2 } ],   // hasta 50
  "me": { "rank": 7, "display_name": "Beto", "score": 900, "games": 1 } | null }     // aunque esté fuera del top
```

`period` inválido o ausente: 400. `GET /api/leaderboard/today/` sigue existiendo (equivale a `period=day` sin `me`).

## Borrado de anónimos inactivos

Un jugador anónimo (dispositivo sin cuenta) que no juega durante 7 días se borra: intentos, puntajes y estadísticas.
Nunca se tocan las cuentas ni lo que un dispositivo ya le pasó a una cuenta. Se libera su nombre público. Corre solo,
una vez al día, con la primera visita (no hay tareas programadas en el hosting gratuito).
`PURGE_ANONYMOUS_AFTER_DAYS` (por defecto 7 en producción; 0 lo apaga) y
`python manage.py purge_inactive_anonymous --days 7 [--dry-run]` para correrlo a mano.

## Fuera de alcance por ahora

El front de estadísticas y rankings.

Hecho en el backend: ranking diario, semanal, mensual y global (todos los jugadores) y borrado de anónimos
inactivos a los 7 días. Falta el front (panel de estadísticas del servidor, nombre público pedido una sola vez,
pantalla de rankings).
