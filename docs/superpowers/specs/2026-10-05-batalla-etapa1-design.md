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
- **Ranking de batallas**, aparte del ranking del juego diario pero **en la misma pantalla** (`/ranking`): ver la sección "Ranking de batallas".

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

La reserva del nombre dentro de la sala reutiliza las reglas del nombre público (palabras no permitidas, caracteres de control, largo).

## Flujo y estados

1. **Lobby:** el organizador crea la sala y comparte link/QR. Los jugadores entran; consultan el estado y ven quién hay.
2. **Empezar:** el organizador toca "Empezar". El servidor sortea las canciones, fija la primera ronda y pasa a `playing`.
3. **Ronda:** `starts_at` es unos segundos en el futuro (cuenta regresiva común). Cada dispositivo reproduce su audio y el jugador responde
   eligiendo una canción del buscador del juego diario. El servidor acepta la respuesta solo entre `starts_at` y `ends_at`.
4. **Entre rondas:** se muestra la respuesta correcta y el ranking parcial durante unos segundos; después abre la siguiente ronda sola.
5. **Final:** ranking final de la sala. La sala queda de solo lectura y se borra a los 7 días.

Las transiciones **no las ejecuta un reloj del servidor**: se calculan al consultar. Cada consulta compara la hora actual con
`starts_at`/`ends_at` y avanza el estado si corresponde (con bloqueo de fila para que dos consultas simultáneas no lo avancen dos veces).
Así el sistema funciona aunque el servidor se haya dormido y no hace falta ningún proceso en segundo plano.

## API (propuesta)

Todas bajo `/api/battles/`. Identidad: `X-Device-Id` y/o sesión, como el juego diario.

- `POST /` crear sala → `{code, host_token}` (el token del organizador se guarda en su dispositivo).
- `GET /<code>/` estado de la sala. Parámetro `since=<version>`: si no cambió, responde `{changed: false, server_time}` sin tocar la base.
- `POST /<code>/join/` entrar con `display_name`.
- `POST /<code>/start/` (organizador) empezar.
- `POST /<code>/answer/` responder la ronda actual.
- `POST /<code>/heartbeat/` opcional; también puede ir en la consulta de estado (`last_seen_at`).

Toda respuesta incluye `server_time` para el ajuste de reloj. Las respuestas con el estado completo incluyen: estado, ronda actual
(con `starts_at`/`ends_at` y la URL fresca del preview solo para jugadores y solo cuando corresponde), lista de jugadores, ranking.
**El jugador nunca recibe la canción correcta antes de que termine la ronda.**

## Ranking de batallas

Decidido por Brandon: las batallas tienen un **ranking aparte** del juego diario, mostrado **en la misma pantalla de ranking**.

- En `/ranking` hay un selector arriba (por ejemplo "Diario | Batallas"). "Diario" es el ranking de hoy; "Batallas" muestra el de batallas con el mismo diseño de filas.
- El ranking de batallas suma los **puntos de las batallas terminadas** de cada jugador. Usa las mismas escalas de tiempo del ranking diario
  (semana, mes, global) para no inventar otra navegación.
- Los puntos de batalla **no se mezclan** con los del juego diario: no cambian su racha, sus estadísticas ni su posición diaria.
- Cuenta cada jugador de una batalla terminada; el organizador, que no juega, no suma.
- El ranking se **calcula en el backend** (como el diario) y se puede compartir la posición, igual que en el ranking actual.
- **Identidad:** para que el ranking tenga nombres únicos, el nombre con el que se entra a una sala es el **nombre público** del jugador
  (único sin distinguir mayúsculas). Si ya tiene uno, se usa; si no, el que escriba pasa a ser su nombre público si está libre, y si no
  se le pide otro. Así no hay dos "Juan" distintos en la misma lista. Los jugadores sin cuenta se siguen identificando por `device_id`.
- Una batalla de una sola persona no suma al ranking (evita sumar puntos jugando solo).

## Puntaje

Reutiliza la idea del juego diario (base + bonus por rapidez): acierto en la ronda da puntos base más un bonus decreciente según
el tiempo transcurrido desde `starts_at` hasta `received_at`. Fallo o sin respuesta: 0. Una respuesta por ronda (la primera válida).
Valores exactos en `settings`, como `GAMEPLAY_BASE_SCORES`; se fijan en el plan.

## Abuso y seguridad

- Código de sala aleatorio con espacio suficiente para que no se adivine; límite de pedidos por IP al crear y al unirse.
- Máximo de jugadores por sala (valor inicial: 60) y de salas activas por organizador.
- Solo el organizador puede empezar o cerrar; verificado por `host_token`.
- Nombres validados igual que el nombre público.
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

- Las batallas son un **ranking aparte, en la misma pantalla** del ranking (Brandon, 2026-10-05).
- Valores por defecto: **10 canciones y 20 segundos por ronda** (propuesta aceptada por Brandon).
- El organizador **no necesita cuenta**: alcanza con su dispositivo (propuesta aceptada por Brandon).

## Preguntas abiertas

1. ¿El ranking de batallas debe mostrar también las batallas más recientes (quién ganó cada una), además de los puntos acumulados?
2. Regla de identidad por nombre público al entrar a una sala (ver "Ranking de batallas"): ¿te parece bien?
