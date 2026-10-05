# Batalla — etapas 2 a 5 (diseño)

Continúa `2026-10-05-batalla-etapa1-design.md` (en producción, restringida a la cuenta de Brandon). Mismos principios: sin sockets, el servidor
manda el estado y el tiempo, el ranking de cada batalla es privado de quienes participaron o la crearon. Lo que Brandon pidió y falta:

| Etapa | Qué agrega |
|---|---|
| **2** | Modo anfitrión (un dispositivo reproduce, el resto responde) y aceptación manual de participantes |
| **3** | Armado de la lista: azar acotado por rango, lista elegida con orden, y enlaces de YouTube |
| **4** | Equipos: al azar o armados por quien organiza; se compite por equipo |
| **5** | Modo presentación: pantalla para proyectar con datos de cómo se va respondiendo |

Cada etapa se construye con pruebas primero, se despliega y queda disponible solo para las cuentas de `BATTLE_CREATOR_EMAILS` (entrar con el link sigue abierto).

## Etapa 2 — anfitrión y aceptación manual

Se eligen al crear la sala (ambos se quedan fijos para esa sala):

- `audio_mode`: `each` (hoy: cada dispositivo reproduce su audio) o `host` (suena solo en el dispositivo de quien organiza, que hace de anfitrión; los jugadores
  solo ven el buscador y la cuenta). En `host` el servidor no manda `preview_url` a los jugadores y se lo manda al organizador.
- `join_mode`: `open` (hoy) o `approval`: al entrar, el jugador queda `pending` y quien organiza lo acepta o lo rechaza desde el lobby.

Detalles:

- `BattlePlayer.status`: `accepted` (por defecto), `pending`, `rejected`. Solo los aceptados juegan, suman al ranking, cuentan para el mínimo de jugadores
  y aparecen en la lista de la sala; el nombre de los pendientes igual queda reservado en la sala.
- `POST /api/battles/<code>/review/` `{player_id, accept}` (solo organizador, solo en el lobby): acepta o rechaza; rechazar a un aceptado lo saca.
  El organizador ve `pending: [{id, name}]` y `players: [{id, name}]`.
- Al empezar, los pendientes que quedan pasan a `rejected`. Un jugador `pending` o `rejected` ve solo su estado ("esperando que te acepten" / "no te aceptaron").
- Audio en modo `host`: la pantalla del organizador desbloquea el audio con el toque en "Empezar" y después suena sola al abrir cada ronda. Para los modos
  `each`, el toque en "Entrar a la sala" también desbloquea el audio del jugador (hoy se pide un toque por ronda si el navegador no deja sonar).

## Etapa 3 — armado de la lista

`songs_mode`: `random` (con filtros) o `list` (ítems explícitos y ordenados).

- **Azar acotado:** filtros opcionales por años (`year_from`, `year_to`) y géneros (`genres`), sobre las canciones visibles con preview. `GET /api/battles/pool/` devuelve
  cuántas canciones cumplen (con ids de ejemplo no; solo el conteo) para que quien organiza vea si alcanza antes de crear.
- **Lista elegida:** quien organiza busca canciones del catálogo y arma la lista, con orden (subir/bajar) y quitar. `round_count` es el largo de la lista.
- **Enlaces de YouTube:** quien organiza pega un enlace; el servidor consulta oEmbed (sin clave) para traer título y canal y propone la canción del catálogo que
  coincide; quien organiza confirma o elige otra. Cada ítem queda como `{song, source: "deezer"|"youtube", youtube_id, start_seconds}`.
  La respuesta siempre es una canción del catálogo (una canción que no está en el catálogo no se puede jugar todavía).
- **Reproducción de YouTube:** reproductor embebido (visible, mínimo 200×200 px, desde `start_seconds`, corta a los N segundos); sin anuncios con YouTube Premium; si el
  video bloquea el embebido (error 101/150) o no arranca, esa ronda cae al preview de Deezer de la misma canción si lo tiene. En modo `host` suena solo en la
  pantalla del organizador. En iPhone cada ronda de YouTube puede pedir un toque.

## Etapa 4 — equipos

`team_mode`: `none`, `random` o `manual`, con `team_count` (2–6) y nombres opcionales.

- `random`: al empezar, el servidor reparte a los jugadores aceptados al azar y parejo. `manual`: en el lobby, el organizador asigna cada jugador a un equipo (los sin
  asignar se reparten al empezar).
- `BattleTeam(battle, name, color)`; `BattlePlayer.team`. Puntaje del equipo: **promedio de puntos por integrante** (justo con equipos desparejos), con el total al lado.
- El ranking de la sala muestra equipos y, abajo, las personas. Los jugadores ven su equipo.

## Etapa 5 — modo presentación

La pantalla del organizador, para proyectar: números grandes, sin buscador.

- Durante la ronda: cuenta regresiva grande, cuántos respondieron (barra), y en modo `host` el audio.
- En la pausa entre rondas: la canción y su artista, **cuánta gente acertó** (%), **quién fue la más rápida**, **las respuestas más elegidas** (acertadas o no) y el ranking.
- Al terminar: podio (personas y, si hay equipos, equipos).
- Los datos salen del servidor: `stats` en el estado de la fase `reveal`/`finished` solo para quien organiza (`correct`, `answered`, `total`, `fastest`, `top_guesses`).

## Fuera de alcance por ahora

Canciones que no están en el catálogo; cambiar los ajustes de una sala ya creada; pantalla de presentación en un dispositivo distinto del organizador (se puede sumar
con un enlace que lleve la clave de organizador).
