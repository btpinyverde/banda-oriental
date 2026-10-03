# Implementación del juego diario

Se ejecutaron las nueve tareas del plan `2026-10-02-frontend-daily-game.md` en una copia independiente del worktree de Claude, conservando su historial y los tres archivos de catálogo que había dejado sin commit. La carpeta original no se modificó. Los commits están separados por tarea.

## Alcance entregado

- Catálogo `GET /api/songs/` y títulos de respuestas en el historial diario.
- Tokens, 33 SVG aprobados, fuentes locales Bricolage Grotesque y Plus Jakarta Sans con sus licencias.
- Identidad anónima persistente, cliente API tipado, íconos, audio, buscador accesible, tabla y ruta `/jugar`.
- Sin fixtures en la aplicación: la pantalla consume el backend real.

## Ajustes al plan surgidos al implementarlo

- CORS permite `X-Device-Id`; sin esto fallaba la integración entre los dominios del frontend y backend.
- La identidad almacenada se valida como UUID; un valor corrupto se reemplaza.
- El catálogo se consulta sin caché y solo para partidas en curso. Un catálogo caído no oculta una partida ya terminada.
- Solo `playing` habilita responder. Después de escuchar se puede pausar o terminar el audio y responder. Un error o buffering vuelve a bloquear. La espera de audio tiene recuperación tras 15 segundos.
- El reproductor se reinicia por día e intento, aunque dos intentos compartan URL (mezcla completa). La etiqueta respeta el tipo de pista del backend. Las mezclas deben subirse acumulativas; el cliente reproduce la última desbloqueada.
- La selección queda visible en el buscador y se invalida cuando se edita. Se agregó `aria-activedescendant` para navegación con teclado.
- Tras un POST incierto o una recarga fallida se conserva la selección y se exige actualizar el estado con GET antes de permitir otro envío. Esto evita gastar otro intento por un reenvío a ciegas.
- Las peticiones HTTP tienen un límite de espera de 30 segundos.
- Se verificaron assets y compilación sin agregar el test de tokens que solo replicaba valores CSS.

## Validación

130 tests backend y 47 tests frontend aprobados. Build de Next.js aprobado durante implementación; el hook pre-push vuelve a ejecutar ambas suites y el build sobre el estado final.

Prueba HTTP contra Django real con SQLite y archivos locales exclusivos de prueba: catálogo, descarga de audio, respuesta incorrecta, historial, desbloqueo de segunda mezcla, respuesta correcta y persistencia del resultado. Vista `/jugar` inspeccionada en el navegador con fuentes locales y audio real.

La base de prueba y sus audios quedan fuera de Git. No se usó la base de producción. El test HTTP utiliza su propio UUID para no alterar la partida del navegador.

## Pendiente para planes posteriores

El diseño completo del prototipo (barras laterales, estadísticas, portada, login, perfiles, batallas y equipos), envío de puntajes, compartir, rachas, ranking y archivo siguen fuera del alcance acordado. Esta entrega es la primera integración funcional del juego diario, no la migración del prototipo entero.

Para desplegar: configurar `NEXT_PUBLIC_API_BASE_URL` con la URL del backend y permitir el dominio del frontend en `CORS_ALLOWED_ORIGINS`. Revisar los commits y la PR antes de fusionar a main; main es la rama asociada al despliegue existente.
