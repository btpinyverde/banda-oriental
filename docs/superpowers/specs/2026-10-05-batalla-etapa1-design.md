# Batalla — etapa 1 (diseño)

Estado: borrador para revisión de Brandon. Nada de esto está programado.

## Qué es la Batalla (visión completa)

Un modo para competir con otra gente en una **sala**. Una persona la crea y la organiza, comparte un link o QR, los demás entran desde su
dispositivo y juegan las mismas canciones al mismo tiempo. Uso previsto: grupos de amigos, un cumpleaños, un bar.

La visión completa tiene piezas independientes. Se construyen por etapas, cada una usable sola:

| Etapa | Qué agrega |
|---|---|
| **1 (este documento)** | Sala, entrar por link/QR, canciones al azar, cada dispositivo con su audio, ranking final |
| 2 | Modo anfitrión (un dispositivo suena, el resto responde) y aceptación manual de participantes |
| 3 | Armado de la lista: acotar el azar por rango, lista elegida a mano con orden, enlaces de YouTube |
| 4 | Equipos (al azar o armados por el organizador) |
| 5 | Modo presentación (pantalla para proyectar con datos de cómo se responde) |

## Principios de diseño (acordados)

1. **Sin sockets.** Todo es request/response contra la API. El servidor es la fuente de verdad; cada dispositivo consulta cada pocos
   segundos y reporta lo que hizo. Así no depende de conexiones persistentes ni de redes inestables.
2. **El tiempo lo pone el servidor.** Cada respuesta del servidor trae su hora; el dispositivo calcula su desfase y muestra el mismo
   instante que los demás. El tiempo de cada respuesta se mide en el servidor (cuándo llegó), nunca con el reloj del dispositivo.
3. **Reconectar es gratis.** Cualquier consulta devuelve el estado actual de la sala; quien perdió señal o recargó vuelve a donde estaba.
4. **Consulta de estado barata.** Si nada cambió, la respuesta es mínima y no toca la base (ver "Capacidad").
5. **Funcional primero.** El diseño visual se pule después, como en el resto del producto.

## Alcance de la etapa 1

Dentro:
- Crear una sala (el organizador define cantidad de canciones y segundos por ronda, con valores por defecto).
- Entrar por link o QR; nombre visible elegido al entrar. Se puede entrar sin cuenta (por `device_id`, como el juego diario) o con cuenta.
- Ingreso abierto: entra cualquiera que tenga el link, hasta que el organizador cierra la sala de espera al empezar.
- El organizador **no juega**: ve la sala, quién entró, el avance y los resultados.
- Canciones al azar del catálogo (sin ocultas), sin repetir dentro de la sala.
- **Cada dispositivo reproduce su propio audio** y responde ahí.
- Puntaje por rapidez y acierto; ranking de la sala al final de cada ronda y al terminar.
- **Mis batallas**: en la pantalla de ranking (`/ranking`), aparte del ranking del juego diario, cada persona ve las batallas en las que participó o que creó, y el ranking de cada una. Ver la sección "Mis batallas".

Fuera (etapas siguientes): modo anfitrión, aceptación manual, rangos y listas a mano, enlaces de YouTube, equipos, presentación.

## Audio en la etapa 1

- Fuente: **preview de Deezer** (30 s, MP3, sin anuncios). Cada canción del catálogo guarda `deezer_id`; el servidor pide el preview al
  empezar la ronda. Los links de Deezer **caducan en unos 15 minutos**, así que nunca se guardan: se piden frescos.
- Limitación conocida (confirmada en la prueba del 2026-10-05): el preview es **un tramo elegido por Deezer, no el principio** de la canción.
  Para la etapa 1 se acepta; el comienzo exacto llega con los enlaces de YouTube (etapa 3).
- Solo entran al azar canciones **con preview disponible**. Si el pedido a Deezer falla al armar la sala, esa canción se cambia por otra.
- El dispositivo reproduce los primeros N segundos del preview y corta con un temporizador local (el audio es local; lo que
  importa para el puntaje es el instante de respuesta medido por el servidor).
- En el celular, cada ronda debe empezar con un toque de la persona (restricción de autoplay de iPhone).

## Modelo de datos

- `Battle`: `code` (corto, único, legible), `host_user` o `host_device_id`, `status` (`lobby` | `playing` | `finished`), `round_count`,
  `round_seconds`, `created_at`, `started_at`, `version` (entero que sube con cada cambio de estado).
- `BattleRound`: `battle`, `position`, `song`, `starts_at`, `ends_at` (los fija el servidor al abrir la ronda).
- `BattlePlayer`: `battle`, `user` o `device_id`, `display_name` (único dentro de la sala, sin distinguir mayúsculas), `joined_at`, `last_seen_at`, `score`.
- `BattleAnswer`: `round`, `player`, `song_guessed`, `correct`, `received_at` (hora del servidor), `points`. Una respuesta final por jugador y ronda.

El nombre dentro de la sala es único solo en esa sala y reutiliza las reglas de validación del nombre público (palabras no permitidas, caracteres de control, largo).

## Flujo y estados

1. **Lobby:** el organizador crea la sala y comparte link/QR. Los jugadores entran; consultan el estado y ven quién hay.
2. **Empezar:** el organizador toca "Empezar". El servidor sortea las canciones, fija la primera ronda y pasa a `playing`.
3. **Ronda:** `starts_at` es unos segundos en el futuro (cuenta regresiva común). Cada dispositivo reproduce su audio y el jugador responde
   eligiendo una canción del buscador del juego diario. El servidor acepta la respuesta solo entre `starts_at` y `ends_at`.
4. **Entre rondas:** se muestra la respuesta correcta y el ranking parcial durante unos segundos; después abre la siguiente ronda sola.
5. **Final:** ranking final de la sala. La sala queda de solo lectura y pasa a "Mis batallas" de cada participante y del organizador.

Las transiciones **no las ejecuta un reloj del servidor**: se calculan al consultar. Cada consulta compara la hora actual con
`starts_at`/`ends_at` y avanza el estado si corresponde (con bloqueo de fila para que dos consultas simultáneas no lo avancen dos veces).
Así el sistema funciona aunque el servidor se haya dormido y no hace falta ningún proceso en segundo plano.

## API (propuesta)

Todas bajo `/api/battles/`. Identidad: `X-Device-Id` y/o sesión, como el juego diario.

- `POST /` crear sala → `{code, host_token}` (el token del organizador se guarda en su dispositivo).
- `GET /mine/` lista de las batallas en las que participó o que creó quien consulta.
- `GET /<code>/` estado de la sala (solo para jugadores y organizador; quien aún no entró ve únicamente los datos necesarios para unirse). Parámetro `since=<version>`: si no cambió, responde `{changed: false, server_time}` sin tocar la base.
- `POST /<code>/join/` entrar con `display_name`.
- `POST /<code>/start/` (organizador) empezar.
- `POST /<code>/answer/` responder la ronda actual.
- `POST /<code>/heartbeat/` opcional; también puede ir en la consulta de estado (`last_seen_at`).

Toda respuesta incluye `server_time` para el ajuste de reloj. Las respuestas con el estado completo incluyen: estado, ronda actual
(con `starts_at`/`ends_at` y la URL fresca del preview solo para jugadores y solo cuando corresponde), lista de jugadores, ranking.
**El jugador nunca recibe la canción correcta antes de que termine la ronda.**

## Mis batallas (ranking de batallas)

Decidido por Brandon: el ranking de una batalla es **privado de esa batalla**. Solo lo ven quienes **participaron** o quien la **creó**. No existe
un ranking general ni público de batallas, y nadie puede ver los resultados de una batalla en la que no estuvo.

- En `/ranking` hay un selector arriba ("Diario | Mis batallas"). "Diario" sigue como hoy.
- "Mis batallas" lista, de la más reciente a la más antigua, las batallas en las que la persona participó o que creó (nombre o fecha,
  cantidad de jugadores, su posición si jugó). Al abrir una se ve **el ranking de esa batalla**, con el mismo diseño de filas.
- Los puntos de una batalla **no se mezclan** con el juego diario: no cambian racha, estadísticas ni posición diaria.
- **Acceso:** el servidor solo entrega una batalla a quien figura como jugador o como organizador (por `user`, `device_id` o `host_token`).
  Para cualquier otra persona la respuesta es "no encontrada", igual que si la sala no existiera; el código de sala solo sirve para **unirse**
  mientras la sala está en el lobby, no para ver resultados.
- **Cuentas:** la persona que juega sin cuenta ve sus batallas por su `device_id`. Al crear la cuenta, sus batallas pasan a la cuenta, igual
  que ya ocurre con las partidas del juego diario (`claim_device_games`).
- **Retención:** la sala y su ranking se conservan para que "Mis batallas" tenga historial (el volumen es chico). Propuesta: sin borrado en
  la etapa 1; se revisa si crece.
- Dentro de una sala, el **nombre visible** es el que la persona escribe al entrar (único en esa sala, sin distinguir mayúsculas). No se
  vincula al nombre público del ranking diario: como no hay ranking general, no hace falta que sea único en todo el sitio.

## Puntaje

Reutiliza la idea del juego diario (base + bonus por rapidez): acierto en la ronda da puntos base más un bonus decreciente según
el tiempo transcurrido desde `starts_at` hasta `received_at`. Fallo o sin respuesta: 0. Una respuesta por ronda (la primera válida).
Valores exactos en `settings`, como `GAMEPLAY_BASE_SCORES`; se fijan en el plan.

## Abuso y seguridad

- Código de sala aleatorio con espacio suficiente para que no se adivine; límite de pedidos por IP al crear y al unirse.
- Máximo de jugadores por sala (valor inicial: 60) y de salas activas por organizador.
- Solo el organizador puede empezar o cerrar; verificado por `host_token`.
- Nombres visibles validados con las mismas reglas del nombre público (palabras no permitidas, caracteres de control, largo).
- Los resultados de una batalla solo los ve quien participó o la creó; para el resto es "no encontrada". Hay una prueba específica de esto.
- No se expone la respuesta correcta durante la ronda; la URL del preview no revela título.

## Capacidad (estimación, no medida)

Render gratis con un solo proceso atiende unas 3 a 6 consultas por segundo si cada una toca la base: unos 10 a 15 jugadores consultando
cada 3 s. Con hilos en `gunicorn`, intervalos adaptativos (más lentos en el lobby, más rápidos cerca de un cambio de ronda) y la
respuesta "sin cambios" desde memoria, se estima 50 a 100 jugadores. **La etapa 1 incluye una prueba de carga** con 50 jugadores simulados
antes de decidir si se paga un plan. El servidor gratis se duerme a los 15 minutos; crear la sala lo despierta.

## Errores y casos borde

- Jugador que pierde señal: vuelve con la próxima consulta; si la ronda pasó, ve el resultado.
- Respuesta que llega tarde (`received_at` > `ends_at`): rechazada.
- Preview que no carga en un dispositivo: el jugador ve "no pudimos reproducir"; la ronda no se anula para los demás.
- Organizador que se desconecta: la sala sigue; al volver con su `host_token` recupera el control.
- Dos jugadores con el mismo nombre: el segundo recibe un error y elige otro.

## Pruebas

- Backend: pruebas primero (TDD) para cada transición de estado, el avance al consultar (incluida la concurrencia), la validación de
  la ventana de respuesta, el puntaje, la reserva de nombres y que nunca se filtre la respuesta correcta.
- Frontend: pruebas de pantallas (crear, lobby, ronda, resultados) con la API simulada.
- Prueba de carga con 50 jugadores simulados.

## Decisiones tomadas

- Las batallas tienen **ranking aparte, en la misma pantalla** del ranking, y **solo lo ven quienes participaron o la crearon**; no hay ranking general (Brandon, 2026-10-05).
- Valores por defecto: **10 canciones y 20 segundos por ronda** (propuesta aceptada por Brandon).
- El organizador **no necesita cuenta**: alcanza con su dispositivo (propuesta aceptada por Brandon).

## Preguntas abiertas

1. ¿Querés poder compartir el resultado de una batalla (por ejemplo una imagen o un link para quien participó) sin que eso muestre la batalla a quien no estuvo? Propuesta: no en la etapa 1.
2. ¿Conviene un nombre o título para la batalla que ponga quien la crea ("Cumple de Ana"), o alcanza con la fecha y los participantes? Propuesta: título opcional.
