import { ApiError } from "./tipos";

// El servidor gratuito se duerme si nadie lo usa y el primer pedido puede tardar casi un minuto en despertarlo.
const ESPERA_MAXIMA_MS = 60000;

// Se lee en cada llamada y no al cargar el módulo, para poder cambiarla en los tests.
export const base = () => (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Pide a la API con un límite de espera. El servidor gratuito puede tardar en despertar; pasado el
 * límite la pantalla queda en un estado que se puede reintentar. Fallos de red y esperas agotadas se
 * informan con `status` 0: no se sabe si el pedido llegó.
 */
export async function pedir(ruta: string, opciones: RequestInit = {}): Promise<Response> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
  // Quien pide también puede cancelar (el buscador, al escribirse otra cosa): se encadena con la espera máxima.
  const deQuienPide = opciones.signal;
  if (deQuienPide) {
    if (deQuienPide.aborted) control.abort();
    else deQuienPide.addEventListener("abort", () => control.abort(), { once: true });
  }
  try {
    return await fetch(`${base()}${ruta}`, { ...opciones, signal: control.signal });
  } catch {
    throw new ApiError(
      control.signal.aborted ? "El servidor tardó demasiado en responder." : "No se pudo conectar con el servidor.",
      0,
    );
  } finally {
    clearTimeout(temporizador);
  }
}

async function leerError(respuesta: Response): Promise<{ detalle: string; codigo?: string }> {
  try {
    const cuerpo = await respuesta.json();
    const codigo = typeof cuerpo.code === "string" ? cuerpo.code : undefined;
    if (typeof cuerpo.detail === "string") return { detalle: cuerpo.detail, codigo };
    const mensajes = Object.values(cuerpo)
      .flat()
      .filter((valor) => typeof valor === "string");
    return { detalle: mensajes.join(" ") || "Error inesperado.", codigo };
  } catch {
    return { detalle: "Error inesperado." };
  }
}

export async function comoJson<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) {
    const { detalle, codigo } = await leerError(respuesta);
    throw new ApiError(detalle, respuesta.status, codigo);
  }
  return respuesta.json();
}

/** Para las respuestas sin cuerpo útil (204, 202): solo importa si salió bien. */
export async function sinCuerpo(respuesta: Response): Promise<void> {
  if (!respuesta.ok) {
    const { detalle, codigo } = await leerError(respuesta);
    throw new ApiError(detalle, respuesta.status, codigo);
  }
}
