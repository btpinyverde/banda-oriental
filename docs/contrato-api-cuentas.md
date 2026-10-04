# Contrato de la API de cuentas (entrega 1)

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
| `POST /api/auth/logout/` | (con token) | `204` y borra solo el token usado. `401` sin token válido. |
| `GET /api/me/` | (con token) | `200 {"email", "date_joined"}`. `401` sin token válido. |

## El enlace del correo

El correo de confirmación trae un enlace como `https://bandaoriental.xami.uy/cuenta/entrar#token=<token>&tipo=confirmar`. El token va en el **fragmento** (después del `#`) para que no llegue a ningún servidor. La página `/cuenta/entrar` lo lee del fragmento y lo manda a `POST /api/auth/confirm/`. Sirve una sola vez y vence a las 24 horas.

Registrarse con un correo que ya tiene cuenta confirmada no cambia nada: la API responde igual y el correo avisa "ya tenés una cuenta". Registrarse otra vez con un correo **sin confirmar** reenvía un enlace nuevo; la contraseña que vale es la que se eligió con el enlace que la persona usó para confirmar (los demás enlaces pendientes quedan sin efecto al confirmar).

## Todavía no existe

Entrar con enlace por correo, recuperar la contraseña, límite de envíos de correo y correo real en producción (entrega 2); partidas asociadas a la cuenta, `GET /api/me/history/` y borrar la cuenta (entrega 3). Hasta la entrega 2, en producción **no se envía ningún correo**.
