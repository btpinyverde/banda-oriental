# Banda Oriental — Diseño de arquitectura

**Fecha:** 2026-10-02
**Estado:** propuesto, pendiente de revisión

## 1. Resumen

Banda Oriental es un juego diario tipo Wordle/Heardle sobre canciones uruguayas.
Cada día hay una única canción objetivo. El jugador escucha fragmentos de audio
(stems separados con Demucs) que se van revelando con cada intento fallido,
junto con pistas de metadata (año, artista, disco, género) comparadas contra su
intento. Gana si adivina el título exacto de la canción dentro de 6 intentos.

No requiere login. Es jugable desde mobile web. El repositorio es público y
forma parte del portfolio del autor — se prioriza un historial de git prolijo,
commits honestos y tests reales por sobre la velocidad de entrega.

## 2. Alcance

**En alcance (MVP):**
- Catálogo de canciones uruguayas poblado automáticamente desde MusicBrainz +
  Cover Art Archive, actualizado periódicamente.
- Panel de administración (Django admin) para subir los 4 stems del día y
  definir la canción del día.
- Juego diario con 6 intentos, feedback estilo Wordle sobre metadata, stems
  progresivos, scoring por intento + velocidad.
- Racha e historial guardados en el navegador (localStorage) con un ID anónimo.
- Leaderboard público del día (nombre + puntaje, sin cuenta), con moderación
  básica y rate limiting.
- Compartir en redes sin revelar la canción mientras el día está vigente;
  revelación completa (con handle de Instagram del artista si está cargado)
  una vez vencido el día.
- Página de archivo público con el calendario de días vencidos.
- Deploy automático en cada push a `main` (frontend en Vercel, backend en
  Render).

**Fuera de alcance (futuro, pero el diseño lo deja habilitado):**
- Cuentas de usuario reales con login. El modelo de datos y los endpoints de
  guardado de resultados están pensados para poder vincularse a una cuenta
  real sin rediseñar el esquema.
- Moderación humana previa de nombres en el leaderboard.
- Variación del número/tipo de stems día a día (siempre son 4, fijos).

## 3. Arquitectura general

Monorepo con dos aplicaciones independientes que se despliegan por separado:

```
banda-oriental/
├── backend/     # Django + DRF, desplegado en Render
└── frontend/    # React + TypeScript, desplegado en Vercel
```

Componentes externos:
- **MusicBrainz API** — fuente de artistas/discos/canciones uruguayas.
- **Cover Art Archive** — portadas de discos.
- **Neon** — Postgres gestionado, free tier sin expiración.
- **Cloudflare R2** — storage de los stems de audio, egress gratis.
- **GitHub Actions** — cron que dispara la sincronización periódica con
  MusicBrainz contra un endpoint protegido del backend.

El frontend nunca se comunica directo con MusicBrainz, Cover Art Archive ni
R2 (salvo para reproducir los archivos de audio vía URL firmada que el
backend le entrega) — todo pasa por el backend, que es la única fuente de
verdad sobre qué es correcto y qué pistas corresponden a cada intento.

## 4. Modelo de datos (Django apps)

**`catalog`** (poblado por el sync, no editable a mano salvo el handle de IG):
- `Artist`: nombre, mbid (MusicBrainz ID), instagram_handle (opcional, manual).
- `Album`: nombre, mbid, artist (FK), año de publicación, género (si la API
  lo provee).
- `Song`: título, mbid, album (FK), duración.

**`gameplay`**:
- `DailySong`: fecha (única, timezone America/Montevideo), song (FK), 4
  `Stem` relacionados, estado (borrador/publicado).
- `Stem`: daily_song (FK), tipo (batería/bajo/voz/otros), orden de
  desbloqueo (1-4, configurable), archivo (referencia a objeto en R2).
- `GuessAttempt`: identificador anónimo del dispositivo, daily_song (FK),
  número de intento, texto adivinado, resultado (correcto/incorrecto),
  feedback calculado (json: {año: exacto/más_vieja/más_nueva, género:
  igual/distinto, artista: igual/distinto, disco: igual/distinto}),
  timestamp.
- `ScoreEntry`: identificador anónimo, daily_song (FK), nombre mostrado,
  puntaje final, intento en que acertó, tiempo total, timestamp. Esta tabla
  es la que alimenta tanto el leaderboard del día como la futura vinculación
  a cuentas de usuario.

El identificador anónimo (UUID generado por el cliente y guardado en
localStorage) es el campo pensado para la migración futura a cuentas reales:
el día que exista login, un usuario autenticado podrá "reclamar" su
historial pasado asociando su UUID a su cuenta.

## 5. Sync con MusicBrainz

Comando de Django `sync_musicbrainz`, idempotente (usa el `mbid` como clave
de upsert, nunca duplica). Flujo:

1. Buscar artistas con `area` o `country` = Uruguay en MusicBrainz.
2. Por cada artista, obtener su discografía (release groups).
3. Por cada disco, obtener las canciones (recordings).
4. Por cada disco, pedir la portada a Cover Art Archive.
5. Guardar/actualizar en `catalog`.

Respeta el rate limit de MusicBrainz (1 request/segundo sin API key). Se
dispara vía GitHub Actions (`schedule: cron`) que hace un POST autenticado
(token secreto en GitHub Secrets) a un endpoint `/api/admin/sync/` del
backend. El backend encola la ejecución del management command.

## 6. Mecánica de juego

- 6 intentos por día. El jugador escribe un guess con autocomplete sobre el
  catálogo de canciones.
- Intento 1: solo el primer stem (orden configurable, default: batería).
- Cada intento fallido 2-6: se suma el siguiente stem Y se devuelve feedback
  comparando el guess fallido contra la canción correcta en 4 ejes: año
  (más vieja/más nueva/exacto), género (igual/distinto), artista
  (igual/distinto), disco (igual/distinto).
- Intento 6 agotado sin acertar: se revela la respuesta, no se suma puntaje.

## 7. API y validación (anti-cheat)

Todo el estado del día vive en el backend. El frontend nunca recibe de
antemano la respuesta ni los stems de intentos futuros. Patrón de polling
simple por request-response (sin WebSockets):

- `GET /api/daily/` — devuelve el estado actual del juego para el
  identificador anónimo del dispositivo (intento actual, stems
  desbloqueados hasta ahora, feedback acumulado). Si el dispositivo ya jugó
  hoy, devuelve el resultado final en vez de permitir seguir jugando.
- `POST /api/daily/guess/` — recibe el guess; responde correcto/incorrecto,
  el siguiente stem (si corresponde) y el feedback de ese intento.
- `POST /api/daily/score/` — registra el `ScoreEntry` final (nombre +
  puntaje) una vez terminada la partida.
- `GET /api/leaderboard/today/` — ranking del día.
- `GET /api/archive/` — lista de días vencidos con su canción revelada.
- `GET /api/archive/<fecha>/` — detalle de un día vencido (canción, artista,
  handle de IG si existe) para armar la tarjeta de compartir retroactiva.

El frontend hace polling liviano a `GET /api/daily/` solo mientras hay una
partida activa (no en background permanente), suficiente para resolver el
requisito de no abrir un canal persistente.

## 8. Scoring

Puntaje = puntaje_base(intento) + bonus_velocidad.

- `puntaje_base`: decreciente por intento (ej. intento 1 = 100, intento 6 =
  20), configurable en settings del backend, no hardcodeado en el frontend.
- `bonus_velocidad`: función del tiempo transcurrido desde que el audio del
  intento actual efectivamente empezó a sonar (evento `playing` del
  `<audio>`, no el click del botón) hasta el envío del guess. Responder
  rápido suma más bonus; hay un techo y un piso para evitar valores
  absurdos.

El audio debe estar listo para reproducirse (evento `canplaythrough` o
`playing`) antes de que el frontend empiece a contar tiempo — si el archivo
está buffereando, se muestra un estado de carga y el cronómetro no arranca
hasta que el audio realmente sonó.

## 9. Frontend

React + TypeScript, mobile-first (se juega desde el navegador del celular
principalmente). Responsabilidades:
- Generar y persistir el UUID anónimo en `localStorage` en el primer uso.
- Guardar racha e historial de resultados pasados en `localStorage`.
- Reproductor de audio que detecta buffering real antes de habilitar el
  cronómetro de respuesta.
- Pantalla de juego, pantalla de resultado/compartir, pantalla de
  leaderboard del día, pantalla de archivo.
- Generación client-side de la tarjeta de compartir (canvas), con dos
  variantes: oculta (día vigente) y revelada (día vencido, con handle de IG
  si existe).

Estilo visual: a definir por el usuario tomando como referencia la app
Pasito (app de fitness/recompensas, estilo gamificado). Los assets concretos
los va a ir pasando el usuario — el frontend se estructura con un sistema de
diseño propio simple (tokens de color/tipografía) para poder aplicar esa
identidad cuando esté lista, sin bloquear el desarrollo funcional.

## 10. Admin

Django admin estándar, extendido con:
- Un flujo para crear un `DailySong`: elegir canción del catálogo, subir los
  4 archivos de stems (se suben directo a R2 desde el admin), asignar el
  orden de desbloqueo.
- Un botón para disparar el sync de MusicBrainz manualmente además del cron.
- Edición del `instagram_handle` de artistas.
- Vista para moderar/borrar entradas del leaderboard a mano si hace falta.

## 11. Leaderboard y moderación

- Un envío de `ScoreEntry` por día por identificador anónimo (rate limit a
  nivel backend).
- Filtro de palabras prohibidas (lista básica ES/EN) aplicado al nombre
  antes de guardar.
- El admin puede borrar entradas puntuales manualmente.

## 12. Compartir y archivo

- Mientras el día está vigente: tarjeta tipo grilla de intentos (✅/❌ por
  intento, sin texto ni imagen de la canción).
- Día vencido (el jugado por el usuario, o cualquier día pasado vía
  `/archivo`): tarjeta con nombre de canción, artista, y mención sugerida al
  handle de Instagram si está cargado.
- `/archivo` es una página pública, no requiere haber jugado ese día, lista
  todos los días vencidos con su canción revelada.

## 13. Infraestructura y despliegue

| Pieza | Servicio | Notas |
|---|---|---|
| Frontend | Vercel | Deploy automático en push a `main` |
| Backend | Render (free, sin Docker) | Deploy automático en push a `main`, duerme tras 15min idle |
| Base de datos | Neon (Postgres free) | No expira, autosuspend/wake |
| Storage audio | Cloudflare R2 | Free tier, egress gratis |
| Sync MusicBrainz | GitHub Actions (cron) | Llama a endpoint protegido del backend |

Variables de entorno sensibles (credenciales de R2, secret del endpoint de
sync, `SECRET_KEY` de Django) van en variables de entorno de cada plataforma,
nunca committeadas. Se documenta un `.env.example` en cada app.

## 14. Testing

- Backend: tests de Django/DRF para el comando de sync (con fixtures/mocks
  de respuestas de MusicBrainz, sin pegarle a la API real en tests), para la
  lógica de scoring, para el cálculo de feedback estilo Wordle, y para los
  endpoints del juego (incluyendo que un dispositivo no pueda jugar dos
  veces el mismo día ni ver pistas de intentos no alcanzados).
- Frontend: tests de componentes para el reproductor de audio (detección de
  buffering) y para la lógica de armado de la tarjeta de compartir.
- Sin tests fabricados para "parecer humano" — tests reales que cubren
  comportamiento real.

## 15. Riesgos conocidos

- **Legal/derechos de audio:** los stems se derivan de grabaciones
  comerciales con copyright. Alojar fragmentos de audio separado
  públicamente (aunque sea a través de URLs firmadas) tiene el mismo tipo de
  riesgo legal que tuvo el Heardle original antes de ser adquirido por
  Spotify. Mitigación: mantener los fragmentos cortos (pocos segundos por
  intento, no la canción completa), no exponer URLs directas y permanentes
  del bucket, y estar dispuesto a retirar contenido ante un reclamo.
- **Cobertura de MusicBrainz para artistas uruguayos:** puede haber huecos o
  metadata incompleta (sobre todo género, que MusicBrainz no siempre tiene).
  El admin necesita poder completar manualmente lo que falte.
- **Cold start de Render:** la primera request del día puede tardar ~30-50s
  si el servicio estaba dormido. Aceptable para un juego de una vez al día,
  pero el frontend debe mostrar un estado de carga claro en ese caso.
