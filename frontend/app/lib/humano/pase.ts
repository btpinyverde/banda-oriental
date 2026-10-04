import { comoJson, pedir } from "../juego/http";
import { ApiError } from "../juego/tipos";
import { resolverDesafio } from "./turnstile";

const claveDelSitio = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
// Se renueva un poco antes de que venza para no mandar un pase que justo expira.
const MARGEN_S = 60;

/** La comprobación humana está encendida cuando hay clave de Cloudflare Turnstile para el sitio. */
export const comprobacionHumanaActiva = (): boolean => claveDelSitio() !== "";

let pase: { valor: string; vence: number } | null = null;
let pendiente: Promise<string> | null = null;

export function olvidarPase(): void {
  pase = null;
}

const NO_SE_PUDO = "No pudimos comprobar que sos una persona. Recargá la página y probá de nuevo.";

/**
 * Un pase firmado de la API (vale 30 minutos) que prueba que se resolvió el desafío: el juego y los formularios de la
 * cuenta lo mandan en `X-Human-Pass`. Se guarda en memoria y varios pedidos a la vez comparten un solo desafío.
 * Sin clave del sitio devuelve `null` y no se pide nada.
 */
export async function obtenerPase(): Promise<string | null> {
  const clave = claveDelSitio();
  if (!clave) return null;
  if (pase && Date.now() < pase.vence) return pase.valor;

  pendiente ??= (async () => {
    try {
      const token = await resolverDesafio(clave);
      const respuesta = await pedir("/api/human/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const datos = await comoJson<{ pass: string; expires_in: number }>(respuesta);
      pase = { valor: datos.pass, vence: Date.now() + (datos.expires_in - MARGEN_S) * 1000 };
      return pase.valor;
    } catch {
      throw new ApiError(NO_SE_PUDO, 0, "human_check_failed");
    } finally {
      pendiente = null;
    }
  })();
  return pendiente;
}
