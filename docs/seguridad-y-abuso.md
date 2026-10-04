# Protección contra abuso, denegación de servicio y agentes de IA

Criterio del dueño: **el sitio es para personas.** Se puede leer la portada; jugar, crear cuentas y usar la API es para quien lo hace desde un navegador, una persona a la vez. Ninguna defensa es perfecta: lo que sigue sube mucho el costo de automatizar el juego, pero un agente que maneje un navegador real como una persona solo se frena con la comprobación humana (y ni siquiera ahí al 100 %).

## Capas (de afuera hacia adentro)

| Capa | Qué hace | Estado |
|---|---|---|
| **Vercel / Cloudflare (bordes)** | Mitigación de DDoS de red y de aplicación (Vercel: *System Mitigations* activas; Render ya pasa por Cloudflare). Rechaza pedidos con cabeceras de IP falsificadas. | Activa, sin configurar nada |
| **`robots.txt`** | Les pide a los rastreadores y agentes de IA que lean solo la portada (`/`). Lo respetan los que se portan bien. | Activo |
| **`proxy.ts` (sitio)** | Los agentes de IA que se identifican (GPTBot, ClaudeBot, ChatGPT-User, PerplexityBot, CCBot, Bytespider, Meta…) reciben **403 en todo menos en la portada**. Googlebot, Bing y las personas no se tocan. | Activo |
| **Middleware de la API** | Los mismos agentes reciben 403 en toda la API (menos `/api/health/`, para los monitores). | Activo |
| **Límites por visitante (API)** | Cuenta los pedidos por **dirección IP real** y responde `429` en español con `Retry-After`: 240/min en general; login 30/hora; correos 12/hora; adivinar 60/min; puntaje 10/hora; lista de canciones 30/min. | Activo (verificado en producción) |
| **Límites por cuenta y por correo** | 5 correos/hora por dirección, tope diario del sitio y de direcciones sin cuenta, bloqueo de login tras 10 fallos por correo. | Activo |
| **Comprobación humana (Cloudflare Turnstile)** | Adivinar, mandar puntaje y los formularios de cuenta piden un pase firmado de 30 min atado a la IP, que se consigue resolviendo un desafío casi siempre invisible. | **Apagada hasta cargar las claves** (abajo) |
| **Cuerpo y costo** | Pedidos de más de 256 KB se rechazan sin leerse; la lista de canciones (1,4 MB) se guarda unos minutos en el servidor. | Activo |
| **Términos y privacidad** | Prohíben bots, scripts y agentes de IA y avisan de la comprobación y de las IP en los registros. | Activo (textos preliminares) |

## Encender la comprobación humana (lo hace Brandon)

1. Cloudflare → *Turnstile* → *Add widget*. Nombre: Banda Oriental. Dominios: `bandaoriental.xami.uy`. Modo: **Managed**. Copiar la **Site Key** (pública) y la **Secret Key** (privada).
2. Render (servicio `banda-oriental-backend`) → *Environment*: `TURNSTILE_SECRET_KEY` = la clave **secreta**. Redespliega solo.
3. Vercel (proyecto `banda-oriental`) → *Environment Variables*: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = la clave **pública**, variable normal. Redeploy.
4. Probar: abrir `/jugar` en una ventana privada, tocar play y adivinar. Tiene que funcionar igual (a lo sumo se ve un recuadro de Cloudflare un instante).
5. Si algo sale mal, **apagarla** es borrar `TURNSTILE_SECRET_KEY` en Render (la API deja de exigir el pase) y la variable pública en Vercel.

Importante: encender solo el lado del backend (con la secreta) **sin** la clave pública en el sitio dejaría a todos sin poder jugar; por eso se cargan las dos juntas.

## Cómo mirar qué pasa

- **Render → Logs**: cada vez que alguien llega a un límite queda `Límite de pedidos alcanzado: GET /api/songs/ desde <IP>`. Muchas líneas con la misma IP = alguien insistiendo. Los correos que no se pueden mandar quedan como "No se pudo enviar el correo" (sin la dirección ni el enlace).
- **Vercel → Firewall → Traffic**: qué se denegó, desafió o limitó en el sitio.
- **Cloudflare → Turnstile**: cuántos desafíos se resolvieron y cuántos fallaron.

## Si hay un ataque de verdad

- Vercel → Firewall → **Attack Challenge Mode** (desafía a todos los visitantes mientras dura).
- Para bloquear una IP: Vercel → Firewall → *Custom Rules* (sitio) o `TRUST_CLOUDFLARE_IP_HEADER` + una regla en Cloudflare (API).
- Subir el plan de Render evita que el servicio se duerma y da más capacidad; el sitio estático en Vercel aguanta mucho más.

## Límites conocidos (decirlos claro)

- Los contadores de límites viven en la memoria del proceso del backend: hoy hay un solo *worker*, así que son exactos; con más, el límite real es por worker y habría que pasar a una base compartida.
- Una IP compartida (oficina, universidad, red móvil) comparte el límite: están holgados para uso normal.
- Un agente que maneja un navegador real **no se puede distinguir por el nombre**: solo la comprobación humana lo frena, y no es infalible. Lo que sí hace este conjunto es impedir que lo hagan en masa o sin esfuerzo.
- El juego usa los audios desde el bucket de Cloudflare R2 con direcciones firmadas de 1 hora: quien ya tiene la página puede descargar esas pistas. No hay forma de impedir que una persona grabe lo que escucha.
