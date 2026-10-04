# Que los correos lleguen a la bandeja (y no a "no deseado")

Los correos de la cuenta salen de `hola@bandaoriental.xami.uy` a través de Resend. Caso que motivó esta guía: un correo a
una dirección de Hotmail/Outlook llegó a "correo no deseado".

## Lo que está bien (verificado con DNS el 2026-10-04)

- **SPF**: `send.bandaoriental.xami.uy` publica el SPF de Resend. Bien.
- **DKIM**: `resend._domainkey.bandaoriental.xami.uy` publicado y verificado en Resend. Bien.
- **DMARC**: hay `v=DMARC1; p=none;` en `_dmarc.xami.uy`, que el subdominio hereda. Funciona, pero es la política más débil y
  sin reportes.
- **Alineación**: el remitente y el dominio de los enlaces del correo son el mismo (`bandaoriental.xami.uy`).
- El correo lleva versión en texto y en HTML, el idioma declarado y ningún seguimiento de clics ni aperturas.

## Qué probablemente lo manda a no deseado

1. **Remitente nuevo, sin historial.** El dominio `bandaoriental.xami.uy` es de ayer y casi no envió. Outlook desconfía de
   remitentes sin reputación hasta que ve que la gente los abre y no los marca como basura. Es la causa más probable y
   la única que solo arregla el tiempo.
2. **El remitente no puede recibir correo.** `bandaoriental.xami.uy` apunta al sitio web (Vercel) y no tiene MX, así que
   si alguien responde a `hola@bandaoriental.xami.uy` rebota. Outlook pesa en contra un remitente al que no se le puede
   contestar. Esto sí se arregla (ver abajo).
3. **IP compartida.** Resend envía desde IP compartidas con otros clientes; si alguno envía mal, algo de eso salpica.
4. **DMARC en `p=none` y sin reportes**: no hay visibilidad de qué pasa con los correos que salen en nombre del dominio.

## Qué hacer, en orden

1. **Que las respuestas lleguen a una casilla real.** En Render, variable `REPLY_TO_EMAIL` con una dirección que
   alguien lea (por ejemplo un alias en Zoho como `hola@xami.uy`, o la casilla personal). Todos los correos de la cuenta
   pasan a llevar ese `Reply-To`. Sin la variable no cambia nada. (No toca el remitente: ese no puede recibir.)
2. **Pedirle a las primeras personas con Hotmail/Outlook** que marquen el correo como **"No es correo no deseado"** y
   agreguen `hola@bandaoriental.xami.uy` a sus contactos. Es lo que más rápido le enseña a Outlook.
3. **Medir antes de cambiar más cosas.** Entrar a mail-tester.com, copiar la dirección de prueba que da, pedir ahí un
   enlace de acceso desde el sitio y mirar el puntaje y lo que marca como problema. Repetirlo después de cada cambio.
4. **DMARC con reportes** (en Antel, registro `_dmarc.xami.uy`): `v=DMARC1; p=none; rua=mailto:<casilla que se lea>`.
   Sirve para ver quién envía en nombre del dominio. Cuando los reportes estén limpios unas semanas, se puede subir a
   `p=quarantine`. Ojo: ese registro también afecta al correo de Zoho de `xami.uy`; cambiarlo con cuidado.
5. **No cambiar muchas cosas a la vez** ni hacer envíos de prueba en tandas: pocos correos reales y constantes construyen
   mejor reputación que una ráfaga.

## Lo que no se puede prometer

Ninguna configuración garantiza la bandeja de entrada en Hotmail; la reputación se construye con el tiempo y con la gente
interactuando bien con los correos. Mientras tanto, el formulario ya le dice a la persona que revise la carpeta de no
deseado.

Configuración relacionada: `docs/activar-correo.md` (Resend, DNS) y `docs/operacion.md` (variables de entorno).
