# Activar el correo de las cuentas

Hasta que esto se haga, **nadie puede confirmar una cuenta, entrar con enlace ni recuperar la contraseña** (la API responde bien pero no manda nada, y al arrancar deja un aviso en el log de Render). Todo lo demás de las cuentas ya está publicado.

Los correos salen por **Resend** (API HTTP; Render gratis bloquea el SMTP). El plan gratuito de Resend permite del orden de 100 correos por día; el sistema tiene sus propios topes (`EMAIL_DAILY_CAP`, 90 por día en total, y `EMAIL_NEW_ADDRESS_DAILY_CAP`, 50 para direcciones sin cuenta) para no pasarse. Conviene confirmar en la página de Resend los límites vigentes antes de lanzar.

## 1. Cuenta y dominio en Resend (lo hace Brandon)

1. Crear la cuenta en resend.com.
2. En *Domains*, agregar el dominio desde el que se manda (por ejemplo `xami.uy`, o un subdominio como `send.xami.uy`; Resend lo recomienda para no mezclar con el correo normal).
3. Resend muestra unos **registros DNS** (SPF, DKIM y a veces MX). Crearlos en **Antel Data**, donde está el DNS de `xami.uy`.
   - `xami.uy` ya tiene un registro SPF de Zoho Mail (`v=spf1 include:zohomail.com ~all`). **Un dominio solo puede tener un SPF**: si Resend pide SPF sobre el mismo nombre, hay que *sumar* su `include` a ese registro, no crear otro. Si se usa un subdominio, no hay conflicto.
4. Esperar a que Resend marque el dominio como *Verified* (puede tardar de minutos a horas).
5. En *API Keys*, crear una clave con permiso de **envío** (*Sending access*) y copiarla.

## 2. Variables en Render (lo hace Brandon)

Servicio `banda-oriental-backend` → *Environment*:

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | la clave del paso anterior |
| `FRONTEND_URL` | `https://bandaoriental.xami.uy` (debe ser https: si no, el servidor no arranca) |
| `DEFAULT_FROM_EMAIL` | `Banda Oriental <no-reply@xami.uy>` (o el remitente del dominio verificado) |

Al guardar, Render redespliega. En el log de arranque debe **desaparecer** el aviso "El correo está APAGADO".

## 3. Probarlo

1. En `https://bandaoriental.xami.uy/login` → *Crear cuenta* con un correo propio y una contraseña de al menos 10 caracteres.
2. Debe llegar el mensaje "Confirmá tu correo en Banda Oriental" (revisar spam la primera vez). Abrir el enlace: tiene que decir que el correo quedó confirmado y la barra pasar a "Mi cuenta".
3. *Cerrar sesión* y probar las otras formas: **entrar con enlace por correo**, y **Olvidé mi contraseña**.
4. Jugar sin cuenta un intento, iniciar sesión y comprobar que el intento aparece como de la cuenta; abrir el juego desde otro navegador con la misma cuenta y ver que sigue en el mismo intento.
5. *Mi cuenta* → *Borrar mi cuenta* para dejar todo limpio.

## Si no llega nada

- Log de Render: un fallo del proveedor queda como "No se pudo enviar el correo" (sin la dirección ni el enlace).
- Dominio de Resend sin verificar, o remitente (`DEFAULT_FROM_EMAIL`) de un dominio distinto al verificado.
- Se alcanzó un límite (5 por hora por dirección o el tope diario): la API responde igual, queda un aviso en el log.
