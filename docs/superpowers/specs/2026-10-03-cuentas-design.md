# Cuentas de usuario — diseño

Fecha: 2026-10-03. Estado: borrador para revisión.

## 1. Objetivo

Que una persona pueda crear una cuenta y entrar para **conservar su historial y sus estadísticas en cualquier dispositivo**, sin que jugar sin cuenta deje de funcionar. Hoy todo se guarda por `device_id` anónimo (backend) y en el navegador (front).

Lo que dijo Brandon:
- Se puede entrar de **dos formas, y la persona elige**: correo + contraseña, o enlace por correo.
- Quien juega sin cuenta sigue guardando su historial en el dispositivo.
- Al crear cuenta o entrar, lo jugado en ese dispositivo se une a la cuenta.

Decisiones técnicas aprobadas ("si, dale" a las tres recomendaciones):
1. **Sesión por token** (no cookies): el front lo guarda y lo manda en cada pedido. Motivo: sitio (Vercel) y API (Render) están en dominios distintos y los navegadores bloquean cada vez más las cookies entre dominios.
2. **Con sesión, la partida cuenta para la cuenta** (no solo para el dispositivo): nadie puede jugar dos veces el mismo día desde dos aparatos.
3. **Quien se registra con contraseña debe confirmar el correo antes de entrar.** El enlace por correo cuenta como confirmación.

## 2. Fuera de alcance (por ahora)

Entrar con Google u otros proveedores, verificación en dos pasos, cambiar el correo, foto o nombre público del perfil, ranking asociado a cuentas, cookies de sesión (se reevalúan si la API pasa a un subdominio de xami.uy).

## 3. Modelo de datos (backend, app nueva `accounts`)

- **Usuario:** el `User` de Django que ya existe. `username` = correo en minúsculas y sin espacios; `email` = el mismo; `is_active` false hasta confirmar. No se cambia a un modelo propio (migrarlo con la base de producción ya creada es costoso).
- **`AuthToken`:** `user`, `key_hash` (SHA-256 del token; el token en claro se muestra una sola vez), `created_at`, `last_used_at`. Varios por usuario (uno por dispositivo/sesión). Cerrar sesión borra el token usado. Vence a los 90 días sin uso.
- **`EmailChallenge`:** `email`, `purpose` (`confirm`, `magic`, `reset`), `token_hash`, `created_at`, `expires_at`, `used_at`. De un solo uso. Vencimiento: 15 minutos para `magic` y `reset`; 24 horas para `confirm`. El token es aleatorio de 32 bytes (`secrets.token_urlsafe`).
- **Cambios en el juego:** `GuessAttempt` y `DailyScore` ganan `user` (FK nullable). Se agregan restricciones únicas condicionales por usuario: `(user, daily_song, attempt_number)` y `(user, daily_song)`, solo cuando `user` no es nulo. Las de `device_id` se mantienen.

## 4. API (`/api/auth/` y `/api/me/`)

Autenticación: encabezado `Authorization: Bearer <token>`. Si falta, todo sigue funcionando como hoy (anónimo por `X-Device-Id`).

| Endpoint | Qué hace |
|---|---|
| `POST /api/auth/register/` {email, password} | Crea el usuario inactivo y envía el correo de confirmación. |
| `POST /api/auth/confirm/` {token} | Confirma el correo, activa el usuario y devuelve un token de sesión. |
| `POST /api/auth/login/` {email, password} | Devuelve un token de sesión. Falla si no confirmó el correo. |
| `POST /api/auth/magic/request/` {email} | Envía el enlace de acceso. Si el correo no existe, crea la cuenta (confirmada al usar el enlace). |
| `POST /api/auth/magic/verify/` {token} | Valida el enlace, activa/confirma la cuenta y devuelve un token de sesión. |
| `POST /api/auth/password-reset/request/` {email} | Envía el enlace para elegir una contraseña nueva. |
| `POST /api/auth/password-reset/confirm/` {token, password} | Cambia la contraseña y cierra las demás sesiones. |
| `POST /api/auth/logout/` | Borra el token usado. |
| `GET /api/me/` | Datos de la cuenta (correo, fecha de alta). |
| `DELETE /api/me/` | Borra la cuenta y todo lo asociado (ver §7). |
| `GET /api/me/history/` | Partidas de la cuenta: día, número, ganada, intentos, feedback y, solo de días pasados, la canción. |

Reglas de seguridad:
- **No revelar si un correo existe:** los endpoints `register`, `magic/request` y `password-reset/request` responden siempre `202` con el mismo cuerpo. Si el correo ya tenía cuenta, `register` envía un correo que lo avisa en vez del de confirmación.
- **Límite de envíos:** máximo 5 correos por dirección por hora (se cuenta con las filas de `EmailChallenge`, así no depende de memoria de un solo proceso) y límite por IP con el throttling de DRF. Límite de intentos de `login` por IP y por correo.
- **Contraseñas:** validadores de Django, mínimo 10 caracteres, hash PBKDF2 por defecto.
- **Enlaces de un solo uso**, marcados como usados al validarse. Se guardan hasheados.

## 5. Correo

- Se envía por la **API de un proveedor** con `django-anymail`, porque Render gratis bloquea el SMTP saliente. Proveedor recomendado: Resend (o Brevo); hay que verificar los límites del plan gratuito vigentes antes de elegir.
- En desarrollo y tests: backend de consola/memoria, sin enviar nada.
- El remitente usa el dominio `xami.uy`, que requiere registros DNS (SPF y DKIM). **Lo hace Brandon**: crear la cuenta del proveedor, agregar los registros y cargar la clave en Render (`ANYMAIL_*`, `DEFAULT_FROM_EMAIL`).
- Los enlaces apuntan al front, con el token en el **fragmento** (`https://bandaoriental.xami.uy/cuenta/entrar#token=...`) para que no llegue a los registros de ningún servidor ni se mande como referrer.
- Plantillas de texto plano y HTML simple en español rioplatense: confirmar correo, enlace de acceso, restablecer contraseña, "ya tenés cuenta".

## 6. Juego con cuenta

- Con token válido, las vistas del juego (`daily`, `guess`, `score`) identifican a la persona por **usuario**: leen y escriben filas con `user` (y guardan también el `device_id`).
- **Al entrar o crear la cuenta**, el pedido incluye `X-Device-Id` y el backend **reclama** para el usuario las filas anónimas de ese dispositivo (`user` nulo). Si el usuario ya tiene partida ese día, **gana la de la cuenta** y la del dispositivo se deja sin reclamar.
- Al cerrar sesión se vuelve a jugar como anónimo con el mismo `device_id`.
- Como el servidor ya tiene todas las partidas de ese dispositivo, **el front no sube su historial local**: al entrar pide `GET /api/me/history/` y lo muestra en lugar del local (el local se conserva por si cierra sesión).

## 7. Borrado de cuenta

`DELETE /api/me/` borra el usuario, sus tokens y sus desafíos, y **todas** las filas de partidas con ese `user` (incluidas las reclamadas del dispositivo). Las filas anónimas que nunca se reclamaron no se tocan. La privacidad debe decir esto.

## 8. Front

- `/login` deja de ser "próximamente": pantalla para **elegir** entre contraseña y enlace por correo; crear cuenta; recuperar contraseña.
- `/cuenta/entrar`: recibe el enlace del correo, valida el token del fragmento y abre la sesión.
- `/cuenta`: correo, cerrar sesión, borrar cuenta (con confirmación).
- Navbar y menú móvil: "Iniciar sesión" pasa a mostrar la cuenta cuando hay sesión.
- Cliente de la API: manda el `Authorization` si hay token; ante `401` limpia la sesión y vuelve al modo anónimo.
- El token se guarda en `localStorage` (clave aparte, p. ej. `banda-oriental:sesion`). Riesgo aceptado: lo podría leer un script inyectado (XSS); mitiga no cargar scripts de terceros. Se reevalúa con cookies si la API pasa a un subdominio.
- Actualizar términos y privacidad (hoy dicen que no hay cuentas): qué datos se guardan, correo, tokens, borrado.

## 9. Pruebas

TDD con pytest (backend, correo en memoria) y vitest (front). Casos clave: no se revela si un correo existe; los enlaces son de un solo uso y vencen; no se puede entrar sin confirmar; el límite de envíos; el reclamo de filas (con y sin conflicto); no se puede jugar dos veces el mismo día desde dos dispositivos con la misma cuenta; el borrado elimina todo lo asociado; un `401` en el front deja el juego anónimo funcionando.

## 10. Entregas (un PR cada una)

1. **Backend, cuentas básicas:** modelos, tokens, registro, confirmación, login, logout, `/me`. Correo en consola.
2. **Backend, correo y recuperación:** proveedor real, enlace de acceso, restablecer contraseña, límites.
3. **Backend, juego con cuenta:** `user` en intentos y puntajes, reclamo de filas, `/me/history`, borrado.
4. **Front:** pantallas, sesión, navbar, unión del historial, textos legales.

## 11. Supuestos a confirmar

- Que el enlace por correo **cree la cuenta** si el correo no existe (es lo más cómodo, pero abre la puerta a que cualquiera cree cuentas con correos ajenos; el límite de envíos lo acota).
- Que borrar la cuenta borre también el historial reclamado (§7) en vez de dejarlo anónimo.
- Proveedor de correo (Resend o Brevo).
