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
| **Comprobación humana (Cloudflare Turnstile)** | Adivinar, mandar puntaje y los formularios de cuenta piden un pase firmado de 30 min atado a la IP, que se consigue resolviendo un desafío casi siempre invisible. | **Sitio listo; falta la clave secreta en Render** (abajo) |
| **Cuerpo y costo** | Pedidos de más de 256 KB se rechazan sin leerse; la lista de canciones (1,4 MB) se guarda unos minutos en el servidor. | Activo |
| **Términos y privacidad** | Prohíben bots, scripts y agentes de IA y avisan de la comprobación y de las IP en los registros. | Activo (textos preliminares) |

## Comprobación humana (Cloudflare Turnstile): casi lista

Ya hecho:
- **Widget creado** en la cuenta de Cloudflare (*Turnstile* → "Banda Oriental", modo **Managed**, dominio `bandaoriental.xami.uy`).
- **Clave pública** cargada en Vercel (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, variable normal) y sitio redesplegado. El juego ya pide el pase al abrirse y la comprobación se resuelve sola, sin mostrar nada. Mientras el backend no tenga la clave secreta, no exige nada (el pase llega vacío y se ignora), así que **hoy el juego anda igual que antes**.

**Falta un solo paso, que tiene que hacer Brandon** (una clave secreta no se pasa por el chat ni por el navegador de otra persona):
1. Cloudflare → *Turnstile* → widget "Banda Oriental" → copiar la **Secret key** (*Click to copy*).
2. Render → servicio `banda-oriental-backend` → *Environment* → *Add Environment Variable*: nombre `TURNSTILE_SECRET_KEY`, valor = la clave secreta → *Save, rebuild, and deploy*.
3. Probar en `/jugar` (ventana privada): tocar play y adivinar tiene que funcionar igual.

Para **apagarla**: borrar `TURNSTILE_SECRET_KEY` en Render (la API deja de exigir el pase; el sitio sigue funcionando).

El orden importa: primero la clave pública en el sitio (ya está) y después la secreta en el backend; al revés, el backend exigiría un pase que el sitio todavía no sabe pedir.

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

## ¿Pasar el DNS de `xami.uy` a Cloudflare?

Se evaluó y **no se recomienda por ahora**. Hoy el DNS está en Antel Data; Cloudflare daría reglas de firewall y límites en el borde para todo el dominio, pero (1) Vercel desaconseja poner un proxy delante de su red y puede romper certificados y la analítica, (2) Render ya pasa por Cloudflare, así que sería un proxy sobre otro proxy, (3) hay que cambiar los *nameservers* en nic.com.uy y volver a crear todos los registros (incluidos los del correo Zoho), con riesgo de dejar el sitio o el correo sin servicio, y (4) lo que aportaría ya está cubierto en la aplicación (límites por IP, bloqueo de agentes, comprobación humana) y en Vercel/Render. Conviene reconsiderarlo si el tráfico real o los ataques crecen.
