# Lanzamiento del juego diario: lista de prueba en producción

Para correr **antes** de mergear el juego (PR #17) y las páginas (PR #18), con una canción de prueba, y otra vez rápida **después** de mergear. API: `https://api.bandaoriental.xami.uy`. Sitio: `https://bandaoriental.xami.uy`.

## 0. Requisitos (tuyos)

- [ ] `NEXT_PUBLIC_API_BASE_URL=https://api.bandaoriental.xami.uy` en Vercel (ya cargada; Production y Preview).
- [ ] Una **canción de prueba** cargada en el admin (`/admin/`) como canción del día **de hoy** (fecha de Montevideo), con estado *publicada* y sus **4 pistas sueltas** (batería, bajo, otros y voz; un instrumento por archivo, todos de la misma duración). El juego las suma a medida que se desbloquean, en ese orden; el `unlock_order` del admin no cambia nada.
- [ ] Opcional: `NEXT_PUBLIC_CORREO_CONTACTO` en Vercel (si falta, Contacto dice "Estamos habilitando el correo de contacto").

## 1. La API, sin navegador

Usá un identificador de prueba propio (cualquier UUID):

```sh
API=https://api.bandaoriental.xami.uy
ID=11111111-2222-4333-8444-555555555555

curl -s $API/api/health/                                  # {"status":"ok","db":"ok"}
curl -s -H "X-Device-Id: $ID" $API/api/daily/             # estado del día
```

Comprobar en la respuesta de `/api/daily/`:
- [ ] `finished` es `false`, `attempt_number` es `1` y hay **una** pista desbloqueada con su `url`.
- [ ] **No aparece** el título, el artista ni el disco de la canción del día (solo se revelan al terminar).
- [ ] La `url` de la pista abre y suena (es un archivo firmado que vence a la hora).
- [ ] Sin el encabezado `X-Device-Id` responde `400`.

CORS (lo que hace el navegador antes de pedir):

```sh
curl -si -X OPTIONS -H "Origin: https://bandaoriental.xami.uy" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: x-device-id,content-type" \
  $API/api/daily/guess/ | grep -i "^HTTP\|access-control"
```
- [ ] Responde `200`, con `access-control-allow-origin: https://bandaoriental.xami.uy` y `x-device-id` entre los headers permitidos.

Catálogo del buscador:
- [ ] `curl -s $API/api/songs/ | head -c 400` devuelve canciones (`id`, `title`, `artist`, `album`, `year`, `genre`) y **no** hay títulos de solo símbolos.

## 2. Jugar de punta a punta (navegador, en la vista previa de Vercel del PR #17 o en producción)

En una ventana privada (para empezar sin historial):

- [ ] `/jugar` carga sin el mensaje "No pudimos cargar el juego" ni "Todavía no hay canción para hoy". Si el servidor estaba dormido, aparece "está despertando" y después carga (puede tardar hasta un minuto).
- [ ] El audio **suena** al tocar play, y recién entonces se habilita enviar el intento. La onda dibujada es la del audio (no una forma genérica).
- [ ] En el intento 2 suenan **batería y bajo juntos**; en el 3 se suma "otros"; en el 4, la voz. La fila de pistas las muestra en ese orden.
- [ ] Buscar una canción, elegirla y enviar: la fila se completa con los colores (verde = acierto, amarillo = cerca, rosa = error) y se desbloquea la pista siguiente.
- [ ] Errar 5 veces y acertar la sexta (o acertar antes): aparece la pantalla final con la canción, el puntaje y la cuenta atrás.
- [ ] Recargar la página a mitad de partida: **conserva los intentos** y no deja volver a empezar.
- [ ] Guardar el puntaje con un nombre: el nombre con una mala palabra se rechaza; uno válido se guarda y aparece en el ranking de `GET /api/leaderboard/today/`.
- [ ] Con el audio caído (probar apagando la red un momento): muestra el error de audio y, al volver la red, se puede reintentar.

Compartir y historial:
- [ ] `/historial` muestra la partida jugada, las estadísticas y la racha.
- [ ] "Compartir resultado" genera la imagen de story (1080 × 1920) **sin** mostrar la canción del día de hoy.
- [ ] En el celular (Safari y Chrome): se abre el menú de compartir con la imagen adjunta.
- [ ] Un día pasado ofrece además "Compartir mostrando la canción".

Celular (390 px y 360 px):
- [ ] La lista de sugerencias del buscador se ve **por encima** de la racha y las estadísticas (corregido en este PR).
- [ ] Nada se corta horizontalmente y no hay scroll lateral.

## 3. Datos y limpieza

- [ ] En el admin, la partida de prueba aparece en intentos y puntajes con el identificador de prueba.
- [ ] **Limpieza antes del lanzamiento real:** borrar esos intentos y puntajes de prueba, y la canción de prueba si no va a ser la del día (o cambiarla por la definitiva). Borrar del ranking cualquier nombre de prueba.
- [ ] Cambiar de día: pasada la medianoche de Montevideo, con la página abierta, carga sola la canción nueva (hace falta tener la del día siguiente publicada).

## 4. Después de mergear (#17 y después #18)

- [ ] El despliegue de Vercel termina en "Ready" y el log de build no tiene errores en rojo.
- [ ] `https://bandaoriental.xami.uy/jugar` abre el juego; `/historial` abre y no está en el sitemap.
- [ ] `https://bandaoriental.xami.uy/sitemap.xml` lista la portada, `/jugar` y las páginas de texto (cómo funciona, acerca, contacto, sugerencias, términos y privacidad).
- [ ] Una página que no existe muestra la 404.
- [ ] En Search Console, volver a enviar el sitemap y pedir la indexación de `/jugar`.
- [ ] En Vercel → Analytics aparecen visitas (puede tardar unos minutos).

## 5. Antes de difundirlo

- [ ] Primera semana de canciones del día cargada, con sus pistas (el juego no puede quedarse sin canción).
- [ ] Un ping cada 5 minutos a `/api/health/` (por ejemplo UptimeRobot) para que Render no se duerma, o pasar a un plan pago: sin eso el primer visitante espera hasta un minuto.
- [ ] Textos legales revisados (son preliminares) y correo de contacto definido.

## 6. Cuentas (cuando esté el correo: ver `docs/activar-correo.md`)

- [ ] Crear cuenta → llega el correo → el enlace confirma y entra. La barra dice "Mi cuenta".
- [ ] Entrar con contraseña, con enlace por correo y "Olvidé mi contraseña" (al cambiarla se cierran las demás sesiones).
- [ ] Jugar un intento sin cuenta y entrar: el intento pasa a la cuenta. Desde otro navegador con la misma cuenta se ve el mismo intento, con la fila completa.
- [ ] Una cuenta no puede jugar dos veces el mismo día desde dos dispositivos.
- [ ] `/historial` muestra los días de la cuenta.
- [ ] Borrar la cuenta borra partidas y puntajes (también salen del ranking).
- [ ] Una cuenta sin confirmar que intenta entrar con la contraseña recibe "Confirmá tu correo" y la opción de pedir un enlace.
