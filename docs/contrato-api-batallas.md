# Contrato de la API de batallas

Base: `/api/battles/`. Todos los pedidos llevan `X-Device-Id` (UUID, como el juego diario) y, si hay sesión, `Authorization: Bearer <token>`.
Quien organiza guarda el `host_token` que devuelve la creación y lo manda en `X-Host-Token` (también sirve la identidad del organizador).
Diseño: `docs/superpowers/specs/2026-10-05-batalla-etapa1-design.md`.

Principios: sin sockets; el servidor es la fuente de verdad del estado y del tiempo; cada dispositivo consulta y reporta.

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/battles/` | cuentas autorizadas | Crea la sala. Mientras el modo se prueba solo pueden las cuentas de `BATTLE_CREATOR_EMAILS` (por defecto, la de Brandon); el resto recibe **404**, como si la ruta no existiera. Con `BATTLE_CREATOR_EMAILS=*` puede cualquiera, también sin cuenta (el lanzamiento público). `GET /api/me/` trae `can_create_battles` para que el sitio sepa si mostrar el modo. Entrar y jugar siguen abiertos a quien tenga el código. Cuerpo opcional: `round_count` (3–30, def. 10), `round_seconds` (5–60, def. 20), `title` (≤60). Devuelve `201 {code, host_token, round_count, round_seconds, title}`. |
| `POST /api/battles/<code>/join/` | cualquiera | Entra con `{display_name}` (1–50, único en la sala sin distinguir mayúsculas). `201 {player:{name}}`; si ya estaba, `200` con su nombre. Solo en el lobby (si no, 404). Quien organiza recibe 400. Sala llena: 400. |
| `POST /api/battles/<code>/start/` | organizador | Sortea las canciones (con preview de Deezer), fija el cronograma y pasa a `playing`. Hace falta el mínimo de jugadores que dice `min_players` en el estado: 1 mientras el modo está restringido a algunas cuentas, 2 cuando se abre a todos (`BATTLE_CREATOR_EMAILS=*`); se fija con `BATTLE_MIN_PLAYERS`. `200 {status:"playing"}`. A cualquier otra persona: 404. |
| `GET /api/battles/<code>/?since=<key>` | participantes | Estado de la sala (abajo). |
| `POST /api/battles/<code>/answer/` | jugadores | `{song_id}`. Solo con una ronda abierta. `200 {received:true}`; **no dice si acertó**. La primera respuesta de la ronda es la que vale. El organizador y los ajenos reciben 404. |
| `GET /api/battles/mine/` | quien consulta | Las batallas en las que participó o que creó: `{battles:[{code,title,status,created_at,players_count,role,my_position}]}`, más recientes primero, máximo 50. |

## Etapa 2: modos de audio y de entrada

Al crear: `audio_mode` (`each` por defecto, o `host`: la música suena solo en el dispositivo de quien organiza) y `join_mode` (`open` por defecto, o `approval`).
- `join` devuelve `{player:{name, status}}`; en `approval` el estado es `pending` hasta que quien organiza lo acepte. Los jugadores `pending`/`rejected` no juegan, no
  rankean, no cuentan para el mínimo y solo ven `my_status`. Al empezar, los que siguen esperando pasan a `rejected`.
- `POST /api/battles/<code>/review/` `{player_id, accept}` (organizador, solo en el lobby): acepta o rechaza; rechazar a un aceptado lo saca. 404 para cualquier otra persona.
- El estado trae `audio_mode`, `join_mode` y, para jugadores, `my_status`. El organizador, en el lobby, ve `players:[{id,name}]` y `pending:[{id,name}]`.
- `round.preview_url` llega solo a quien debe reproducir: a los jugadores en `each`, al organizador en `host`.

## Etapa 3: cómo se eligen las canciones

Al crear: `songs_mode` (`random` por defecto, o `list`).
- **`random` con `filters`** (opcional): `{include: {year_from, year_to, genres[], artists[] (ids), release_types[] (album|ep|single), duration_min, duration_max}, exclude: {genres[], artists[], release_types[], years: [[desde, hasta]], songs[] (ids)}}`. Un filtro vacío no filtra; todo se combina con Y. Las canciones sin año no se pierden al excluir rangos de años. Siempre: canciones visibles y con id de Deezer. Si hay menos canciones que rondas, `start` responde 400 ("No hay suficientes canciones que cumplan los filtros…"). Los filtros se validan y se guardan en la sala.
- **`list` con `playlist`**: `[{song_id, source: "deezer"|"youtube", youtube_id, start_seconds}]` en el orden en que van a salir; `round_count` pasa a ser el largo de la lista. Sin repetidas, solo canciones visibles. Un ítem `deezer` necesita su preview (si no, `start` falla nombrando la canción); uno `youtube` no (Deezer es solo su reserva).
- `POST /api/battles/pool/` `{filters}` → `{count}`: cuántas canciones cumplen (misma autorización que crear: 404 para el resto).
- `POST /api/battles/youtube/` `{url}` → `{youtube_id, title, author, suggestions: [canción del catálogo]}`: lee el enlace (watch, youtu.be, shorts, embed, music.youtube) con oEmbed. Un video que no existe (oEmbed 400/404) o que oEmbed dice que no permite embeberse (401) se rechaza con 400 y el motivo. **oEmbed no detecta todos los videos con embed bloqueado** (para algunos, como el clip de «Zafar», responde 200 y el reproductor después da el error 150): por eso el sitio prueba el reproductor sobre el video al armar la lista y, si falla, deja esa canción con el preview de Deezer; y si un video falla durante la ronda, suena el preview de reserva. Las sugerencias son las canciones del catálogo que coinciden con el título.
- `round` en el estado trae `source` y, para `youtube`, `youtube_id` y `start_seconds`, junto con `preview_url` (la reserva) y solo a quien debe reproducir (según `audio_mode`).

## Etapa 4: equipos

Al crear: `team_mode` (`none` por defecto, `random` o `manual`), `team_count` (2–6, obligatorio con equipos) y `team_names` (opcional, hasta uno por equipo; los vacíos toman «Equipo N»; sin repetir, sin palabras no permitidas). Cada equipo tiene un color de una paleta fija.
- `random`: al empezar, las personas aceptadas se reparten al azar y parejo. `manual`: en el lobby, quien organiza usa `POST /api/battles/<code>/team/` `{player_id, team_id|null}` (solo organizador, solo en el lobby, solo salas `manual`, solo jugadores aceptados y equipos de esa sala; 404 para el resto); al empezar, quienes quedaron sin equipo van al equipo con menos gente.
- Para competir por equipos tiene que haber gente en al menos dos equipos (basta con uno mientras el modo se prueba, cuando `min_players` es 1).
- El estado trae `team_mode`, `teams: [{id, name, color}]`, `team` en cada jugador, `my_team` para jugadores y, en `reveal`/`finished`, `team_ranking: [{position, id, name, color, members, points (promedio por integrante), total, correct}]`. Los equipos sin integrantes no compiten. Se ordena por promedio, luego total, luego nombre; el ranking de personas no cambia.

## Etapa 5: modo presentación

Es la pantalla de quien organiza, en grande y a pantalla completa, para proyectarla (botón «Modo presentación» en el sitio; no cambia la API). Para eso el estado trae, **solo al organizador** y en las fases `reveal` y `finished`, `stats` de la ronda que acaba de cerrar: `{total, answered, correct, fastest: {name, seconds}|null, top_guesses: [{title, artist, count, correct}] (las 3 más elegidas)}`. Las personas rechazadas o en espera no cuentan. Al terminar, `stats` es el de la última ronda; el podio (tres primeros, de jugadores y de equipos) sale de `ranking` y `team_ranking`.

## Estado (`GET /api/battles/<code>/`)

- **Quien no participó:** si la sala está en el lobby, `{joinable:true, code, title, round_count, round_seconds, players_count}`; en cualquier otro caso, **404** (igual que una sala inexistente). Los resultados de una batalla solo los ven quienes participaron o la crearon.
- **Participantes:** `{changed:true, server_time, key, code, title, role, status, round_count, round_seconds, phase:{name,index}, round, min_players, players, reveal?, ranking?}`.
  - `phase.name`: `lobby`, `countdown` (antes de la primera ronda), `playing`, `reveal` (pausa entre rondas) o `finished`.
  - `round`: en `countdown`/`playing`, la ronda actual; en `reveal`, la **siguiente** (para precargar el audio); `null` si no hay. Trae `{index, starts_at, ends_at}` y, **solo a jugadores**, `preview_url` y `answered`. El link del preview caduca en ~15 min: no se guarda.
  - `players`: `[{name}]`; al organizador se le agrega `answered` en la ronda en curso.
  - `reveal` y `ranking`: solo en `reveal` y `finished`. `reveal = {song, my_answer:{correct,points,guessed}|null}`. **La canción correcta no se envía antes de `ends_at`.**
- **Sin cambios:** con `?since=<key>` igual al `key` actual, responde `{changed:false, server_time}`.
- `server_time` permite calcular el desfase del reloj del dispositivo; el tiempo de cada respuesta lo mide el servidor.

## Cronograma

Al empezar se fijan todas las rondas: la ronda `i` abre `COUNTDOWN + i·(round_seconds + REVEAL)` segundos después de empezar (`COUNTDOWN=5`, `REVEAL=6`) y dura `round_seconds`. Una respuesta vale desde `starts_at` (incluido) hasta `ends_at` (excluido).

## Puntaje

Acierto: `100 + round(50 · (1 − transcurrido/round_seconds))`; fallo o sin respuesta: 0. El ranking de la sala ordena por puntos, luego aciertos, luego nombre.

## Intervalos de consulta sugeridos

3 s en el lobby, en la pausa entre rondas y al terminar; 1,5 s en la cuenta regresiva; 2 s durante la ronda. Pausar con la pestaña oculta y consultar apenas vuelve a verse.

## Límites

`battle-create` 20/hora (con comprobación humana), `battle-join` 600/hora (entrar y empezar), `battle-answer` 1500/min, `battle-state` 3000/min, todos por IP.
Un bar entero comparte una dirección, así que **consultar el estado, `mine`, entrar y responder no cuentan contra el límite global de 240/min**, y
**entrar no pide la comprobación humana** (el pase tiene un tope de 30 por hora por dirección). Una sala se protege con su código secreto, el
máximo de 60 jugadores y esos límites por ruta. Crear y empezar sí cuentan contra el límite global.

## Borrar la cuenta

`DELETE /api/me/` también saca a la cuenta de las batallas: sus jugadores pasan a llamarse «Jugador eliminado N», pierden el dispositivo y la cuenta, pero conservan sus respuestas y puntos (el ranking de los demás no cambia). Las salas que organizaba quedan para quienes jugaron, sin dueño; una sala a la que nadie entró se borra.
