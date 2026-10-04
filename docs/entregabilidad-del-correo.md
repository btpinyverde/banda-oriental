# Que los correos lleguen a la bandeja de entrada (en cualquier proveedor)

Los correos de la cuenta (confirmar, entrar con enlace, cambiar la contraseña) salen de `hola@bandaoriental.xami.uy` a
través de Resend. Esta guía sirve para Gmail, Outlook/Hotmail, Yahoo, iCloud y cualquier otro: los proveedores usan
señales parecidas, con diferencias de rigor. Caso que la motivó: un correo a una dirección de Hotmail llegó a "no deseado".

## Lo que está bien (verificado con DNS el 2026-10-04)

- **SPF**: `send.bandaoriental.xami.uy` publica el SPF de Resend.
- **DKIM**: `resend._domainkey.bandaoriental.xami.uy` publicado y verificado en Resend.
- **DMARC**: hay `v=DMARC1; p=none;` en `_dmarc.xami.uy`, que el subdominio hereda. Funciona, pero es la política más débil y
  sin reportes.
- **Alineación**: el remitente y el dominio de los enlaces del correo son el mismo (`bandaoriental.xami.uy`).
- El correo lleva versión en texto y en HTML, el idioma declarado, ningún seguimiento de clics ni aperturas y enlaces
  con el dominio propio (nada de acortadores).

## Qué hace que un correo vaya a no deseado (en cualquier proveedor)

| Señal | Cómo estamos |
|---|---|
| **Autenticación** (SPF, DKIM, DMARC alineados) | Bien. Gmail y Yahoo la exigen desde 2024 a quien envía en volumen; Outlook también la mira. |
| **Reputación del dominio y de la IP** | El dominio es nuevo y casi no envió: sin historial. La IP es compartida (Resend). Es la causa más probable y solo el tiempo y la buena interacción la arreglan. |
| **Interacción de la gente** (abre, responde, marca "no es spam" o "es spam") | Pocas personas todavía. Cada "es spam" pesa mucho. |
| **Que el remitente pueda recibir respuestas** | **No**: `bandaoriental.xami.uy` apunta al sitio (Vercel) y no tiene MX, así que responder a `hola@bandaoriental.xami.uy` rebota. Se arregla con `REPLY_TO_EMAIL`. |
| **Contenido** (palabras de spam, mucho HTML, imágenes sin texto, enlaces raros) | Bien: texto + HTML simples, poco texto de venta, enlaces propios. |
| **Quejas por spam** | Mantenerlas bajo 0,1 % (Gmail y Yahoo piden no pasar de 0,3 %). Con pocas personas, una sola queja ya es mucho. |
| **Tipo de correo** | Los correos de cuenta son transaccionales (los pide la persona en ese momento): llegan mejor que las novedades. No mezclarlos (ver abajo). |

## Qué hacer, en orden

1. **Que las respuestas lleguen a una casilla real.** En Render, variable `REPLY_TO_EMAIL` con una dirección que alguien
   lea (por ejemplo un alias en Zoho como `hola@xami.uy`, o la casilla personal). Todos los correos de la cuenta pasan a
   llevar ese `Reply-To`. Sin la variable no cambia nada. (No toca el remitente: ese no puede recibir.)
2. **Ver cómo llega de verdad.** En Gmail: abrir el correo → "Mostrar original" y mirar que SPF, DKIM y DMARC digan `PASS`.
   En Outlook: "Ver origen del mensaje". Si algo no dice `PASS`, ahí está el problema.
3. **Medir con una herramienta.** Entrar a mail-tester.com, copiar la dirección de prueba que da, pedir ahí un enlace de
   acceso desde el sitio y mirar el puntaje y qué marca como problema. Repetirlo después de cada cambio.
4. **Mirar la reputación en cada proveedor** (gratis y sin tocar el código):
   - **Gmail**: Google Postmaster Tools. Se verifica el dominio con un registro TXT y muestra reputación del dominio, tasa
     de spam y errores de autenticación.
   - **Outlook/Hotmail**: SNDS y JMRP sirven para IP propias; con la IP compartida de Resend no aplican. Sí existe un
     formulario de soporte para remitentes de Outlook.com si el problema persiste semanas.
   - **Yahoo**: Sender Hub, con reglas parecidas a las de Gmail.
5. **Enseñarle al proveedor que el correo es bueno.** A las primeras personas que lo reciban en no deseado, pedirles que lo
   marquen como **"No es spam"** y agreguen el remitente a sus contactos. Es lo que más rápido ayuda, en cualquier
   proveedor.
6. **DMARC con reportes** (en Antel, registro `_dmarc.xami.uy`): `v=DMARC1; p=none; rua=mailto:<casilla que se lea>`. Sirve
   para ver quién envía en nombre del dominio. Cuando los reportes estén limpios unas semanas, se puede subir a
   `p=quarantine`. Ojo: ese registro también afecta al correo de Zoho de `xami.uy`; cambiarlo con cuidado.
7. **No cambiar muchas cosas a la vez** ni hacer envíos de prueba en tandas: pocos correos reales y constantes construyen
   mejor reputación que una ráfaga.

## Cuando se manden novedades (todavía no se manda ninguna)

Las novedades por correo son otro tipo de correo (marketing) y tienen reglas más duras. Antes de mandar la primera:

- **Solo a quien lo eligió** (la casilla opcional del registro o de Mi cuenta) y respetando que lo pueda cambiar.
- **Enlace para darse de baja en el correo** y las cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click`. Gmail y Yahoo las exigen a quien envía en volumen y bajan mucho las quejas.
- **Mandarlas desde otro subdominio** (por ejemplo `novedades.xami.uy`, verificado aparte en Resend), para que si alguien las
  marca como spam no se contagie la reputación de los correos de cuenta, que son los que no pueden fallar.
- Empezar con pocos envíos y crecer de a poco (calentamiento), mirando las quejas.

## Lo que no se puede prometer

Ninguna configuración garantiza la bandeja de entrada en ningún proveedor; la reputación se construye con el tiempo y con la
gente interactuando bien con los correos. Mientras tanto, el formulario ya le dice a la persona que revise la carpeta de no
deseado.

Configuración relacionada: `docs/activar-correo.md` (Resend, DNS) y `docs/operacion.md` (variables de entorno).
