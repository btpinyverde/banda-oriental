import {
  type CancionCatalogo,
  type ClienteJuego,
  type EstadoDelDia,
  type ResultadoIntento,
  type ResultadoPuntaje,
} from "./tipos";
import { borrarSesion, leerSesion } from "../cuenta/sesion";
import { comoJson, pedir } from "./http";

type Opciones = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

/**
 * Pide algo del juego con la sesión de la cuenta, si hay una. Si la API dice 401 (la sesión venció o se cerró en otro
 * dispositivo) se borra y el pedido se repite una vez sin sesión: la persona sigue jugando como anónima.
 */
async function pedirDelJuego(ruta: string, opciones: Opciones = {}): Promise<Response> {
  const sesion = leerSesion();
  const respuesta = await pedir(ruta, {
    ...opciones,
    headers: { ...opciones.headers, ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}) },
  });
  if (respuesta.status !== 401 || !sesion) return respuesta;
  borrarSesion();
  return pedir(ruta, opciones);
}

/** Cliente real: habla con los endpoints del backend. Lo que falta del backend está en docs/contrato-api-jugar.md. */
export function crearClienteHttp(): ClienteJuego {
  return {
    async estadoDelDia(idDispositivo): Promise<EstadoDelDia | null> {
      const respuesta = await pedirDelJuego("/api/daily/", { headers: { "X-Device-Id": idDispositivo }, cache: "no-store" });
      if (respuesta.status === 404) return null;
      return comoJson<EstadoDelDia>(respuesta);
    },

    async enviarIntento(idDispositivo, numeroDeIntento, idCancion): Promise<ResultadoIntento> {
      const respuesta = await pedirDelJuego("/api/daily/guess/", {
        method: "POST",
        headers: { "X-Device-Id": idDispositivo, "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_number: numeroDeIntento, song_id: idCancion }),
      });
      return comoJson<ResultadoIntento>(respuesta);
    },

    async enviarPuntaje(idDispositivo, nombre, segundosTotales): Promise<ResultadoPuntaje> {
      const respuesta = await pedirDelJuego("/api/daily/score/", {
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
