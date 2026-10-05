# Contrato de la API de batallas

Base: `/api/battles/`. Todos los pedidos llevan `X-Device-Id` (UUID, como el juego diario) y, si hay sesión, `Authorization: Bearer <token>`.
Quien organiza guarda el `host_token` que devuelve la creación y lo manda en `X-Host-Token` (también sirve la identidad del organizador).
Diseño: `docs/superpowers/specs/2026-10-05-batalla-etapa1-design.md`.

Principios: sin sockets; el servidor es la fuente de verdad del estado y del tiempo; cada dispositivo consulta y reporta.

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/battles/` | cualquiera | Crea la sala. Cuerpo opcional: `round_count` (3–30, def. 10), `round_seconds` (5–60, def. 20), `title` (≤60). Devuelve `201 {code, host_token, round_count, round_seconds, title}`. |
| `POST /api/battles/<code>/join/` | cualquiera | Entra con `{display_name}` (1–50, único en la sala sin distinguir mayúsculas). `201 {player:{name}}`; si ya estaba, `200` con su nombre. Solo en el lobby (si no, 404). Quien organiza recibe 400. Sala llena: 400. |
| `POST /api/battles/<code>/start/` | organizador | Sortea las canciones (con preview de Deezer), fija el cronograma y pasa a `playing`. Hacen falta ≥2 jugadores. `200 {status:"playing"}`. A cualquier otra persona: 404. |
| `GET /api/battles/<code>/?since=<key>` | participantes | Estado de la sala (abajo). |
| `POST /api/battles/<code>/answer/` | jugadores | `{song_id}`. Solo con una ronda abierta. `200 {received:true}`; **no dice si acertó**. La primera respuesta de la ronda es la que vale. El organizador y los ajenos reciben 404. |
| `GET /api/battles/mine/` | quien consulta | Las batallas en las que participó o que creó: `{battles:[{code,title,status,created_at,players_count,role,my_position}]}`, más recientes primero, máximo 50. |

## Estado (`GET /api/battles/<code>/`)

- **Quien no participó:** si la sala está en el lobby, `{joinable:true, code, title, round_count, round_seconds, players_count}`; en cualquier otro caso, **404** (igual que una sala inexistente). Los resultados de una batalla solo los ven quienes participaron o la crearon.
- **Participantes:** `{changed:true, server_time, key, code, title, role, status, round_count, round_seconds, phase:{name,index}, round, players, reveal?, ranking?}`.
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
