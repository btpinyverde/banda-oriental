# Contrato de la API de cuentas

Lo que el front puede usar hoy. Diseño completo: `docs/superpowers/specs/2026-10-03-cuentas-design.md`.

## Sesión

- Al entrar o confirmar el correo, la API devuelve un `token`. El front lo guarda y lo manda en cada pedido: `Authorization: Bearer <token>`.
- Sin ese encabezado la API sigue funcionando como hasta ahora: anónima, por `X-Device-Id`. Esta entrega no cambia ninguna ruta del juego.
- Un token vence a los 90 días sin usarse.
- Si un pedido con token devuelve **`401`**, la sesión ya no sirve: el front la borra y sigue como anónimo.
- El correo se normaliza (sin espacios y en minúsculas) en todos los endpoints. Máximo 150 caracteres. Contraseña: mínimo 10 caracteres y no puede ser común ni solo números.

## Endpoints

| Método y ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /api/auth/register/` | `{email, password}` | `202 {"detail": "Si el correo es válido, te enviamos un mensaje para continuar."}` siempre que la entrada sea válida, exista o no el correo. `400` con los errores por campo (`email`, `password`). |
| `POST /api/auth/confirm/` | `{token}` | `200 {"token"}` y deja la cuenta activa. `400 {"detail": "El enlace no es válido o venció."}` si el enlace no existe, ya se usó o venció. |
| `POST /api/auth/login/` | `{email, password}` | `200 {"token"}`. `400 {"detail": "Correo o contraseña incorrectos."}` (igual para correo inexistente y contraseña errónea). `403 {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"}` solo si la contraseña es correcta y la cuenta no está confirmada. |
| `POST /api/auth/magic/request/` | `{email}` | `202` (igual siempre, exista o no el correo). Manda un enlace de acceso; si el correo no tiene cuenta, usar el enlace la crea. `400` si el correo no es válido. |
| `POST /api/auth/magic/verify/` | `{token}` | `200 {"token"}`. `400 {"detail": "El enlace no es válido o venció."}`. |
| `POST /api/auth/password-reset/request/` | `{email}` | `202` (igual siempre). Solo manda correo si la cuenta existe y está confirmada. |
| `POST /api/auth/password-reset/confirm/` | `{token, password}` | `200 {"token"}` y **cierra todas las demás sesiones**. `400` con `password` si es débil (el enlace no se gasta) o `400` "enlace no válido". También sirve para elegir la primera contraseña de una cuenta creada con enlace. |
| `POST /api/auth/logout/` | (con token) | `204` y borra solo el token usado. `401` sin token válido. |
| `GET /api/me/` | (con token) | `200 {"email", "date_joined"}`. `401` sin token válido. |

## Los enlaces del correo

Todos llevan el token en el **fragmento** (después del `#`), para que no llegue a ningún servidor, y dicen qué hacer en `tipo`:

| `tipo` | Qué es | A qué endpoint va el token |
|---|---|---|
| `confirmar` | Confirmar el correo de una cuenta nueva (vence a las 24 h) | `POST /api/auth/confirm/` |
| `acceso` | Entrar sin contraseña (vence a los 15 min) | `POST /api/auth/magic/verify/` |
| `restablecer` | Elegir una contraseña nueva (vence a los 15 min) | `POST /api/auth/password-reset/confirm/` (junto con la contraseña) |

Ejemplo: `https://bandaoriental.xami.uy/cuenta/entrar#token=<token>&tipo=acceso`. Cada enlace sirve **una sola vez**.

## Reglas que el front no tiene que adivinar

- Los endpoints que mandan correo (`register`, `magic/request`, `password-reset/request`) **responden siempre lo mismo**, con o sin cuenta, con o sin límite: no revelan nada. No hay forma de saber si el correo salió; el texto debe decir "si el correo es válido, te enviamos un mensaje".
- Límite de envío: 5 correos por hora por dirección y un tope diario de todo el sitio. Pasado el límite la API sigue respondiendo `202` pero no manda nada.
- Registrarse otra vez con un correo **sin confirmar** manda un enlace nuevo; la contraseña que vale es la del enlace que se usó. Con un correo ya confirmado manda un aviso de "ya tenés una cuenta".
- Una cuenta bloqueada desde el admin no puede entrar por ningún camino (todos los enlaces dan "no válido").
- Sin cuenta se puede seguir jugando: el encabezado `Authorization` es opcional.

## Todavía no existe

Partidas asociadas a la cuenta, `GET /api/me/history/` y borrar la cuenta (entrega 3). En producción **no se envía correo** hasta que se configure `RESEND_API_KEY` (y el dominio de envío esté verificado).
