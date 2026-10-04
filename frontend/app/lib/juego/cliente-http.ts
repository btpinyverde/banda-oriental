import {
  ApiError,
  type CancionCatalogo,
  type ClienteJuego,
  type EstadoDelDia,
  type ResultadoIntento,
  type ResultadoPuntaje,
} from "./tipos";

// El servidor gratuito se duerme si nadie lo usa y el primer pedido puede tardar casi un minuto en despertarlo.
const ESPERA_MAXIMA_MS = 60000;

// Se lee en cada llamada y no al cargar el módulo, para poder cambiarla en los tests.
const base = () => (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Pide a la API con un límite de espera. El servidor gratuito puede tardar en despertar; pasado el
 * límite el juego queda en un estado que se puede reintentar. Fallos de red y esperas agotadas se
 * informan con `status` 0: no se sabe si el pedido llegó.
 */
async function pedir(ruta: string, opciones: RequestInit = {}): Promise<Response> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
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

async function detalleDelError(respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json();
    if (typeof cuerpo.detail === "string") return cuerpo.detail;
    const mensajes = Object.values(cuerpo)
      .flat()
      .filter((valor) => typeof valor === "string");
    return mensajes.join(" ") || "Error inesperado.";
  } catch {
    return "Error inesperado.";
  }
}

async function comoJson<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) throw new ApiError(await detalleDelError(respuesta), respuesta.status);
  return respuesta.json();
}

/** Cliente real: habla con los endpoints del backend. Lo que falta del backend está en docs/contrato-api-jugar.md. */
export function crearClienteHttp(): ClienteJuego {
  return {
    async estadoDelDia(idDispositivo): Promise<EstadoDelDia | null> {
      const respuesta = await pedir("/api/daily/", { headers: { "X-Device-Id": idDispositivo }, cache: "no-store" });
      if (respuesta.status === 404) return null;
      return comoJson<EstadoDelDia>(respuesta);
    },

    async enviarIntento(idDispositivo, numeroDeIntento, idCancion): Promise<ResultadoIntento> {
      const respuesta = await pedir("/api/daily/guess/", {
        method: "POST",
        headers: { "X-Device-Id": idDispositivo, "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_number: numeroDeIntento, song_id: idCancion }),
      });
      return comoJson<ResultadoIntento>(respuesta);
    },

    async enviarPuntaje(idDispositivo, nombre, segundosTotales): Promise<ResultadoPuntaje> {
      const respuesta = await pedir("/api/daily/score/", {
        method: "POST",
        headers: { "X-Device-Id": idDispositivo, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: nombre, total_time_seconds: segundosTotales }),
      });
      return comoJson<ResultadoPuntaje>(respuesta);
    },

    async listarCanciones(): Promise<CancionCatalogo[]> {
      const respuesta = await pedir("/api/songs/", { cache: "no-store" });
      const datos = await comoJson<{ songs: CancionCatalogo[] }>(respuesta);
      return datos.songs;
    },
  };
}
