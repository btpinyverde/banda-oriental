import {
  type CancionCatalogo,
  type ClienteJuego,
  type EstadoDelDia,
  type ResultadoIntento,
  type ResultadoPuntaje,
} from "./tipos";
import { comoJson, pedir } from "./http";
import { pedirDelJuego } from "./pedir-del-juego";

/** Cliente real: habla con los endpoints del backend. Lo que falta del backend está en docs/contrato-api-jugar.md. */
export type ClienteHttp = ClienteJuego & { listarCanciones(): Promise<CancionCatalogo[]> };

export function crearClienteHttp(): ClienteHttp {
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
      }, true);
      return comoJson<ResultadoIntento>(respuesta);
    },

    async enviarPuntaje(idDispositivo, nombre, segundosTotales): Promise<ResultadoPuntaje> {
      const respuesta = await pedirDelJuego("/api/daily/score/", {
        method: "POST",
        headers: { "X-Device-Id": idDispositivo, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: nombre, total_time_seconds: segundosTotales }),
      }, true);
      return comoJson<ResultadoPuntaje>(respuesta);
    },

    /** Busca en el servidor, de a páginas: nunca se baja el catálogo. */
    async buscarCanciones(texto, pagina, senial) {
      const respuesta = await pedir(`/api/songs/?${new URLSearchParams({ q: texto, page: String(pagina) })}`, { signal: senial });
      const datos = await comoJson<{ results: CancionCatalogo[]; has_more: boolean }>(respuesta);
      return { canciones: datos.results, hayMas: datos.has_more };
    },

    /** La lista completa (varios MB): solo para el modo de demostración con el catálogo real, nunca para el juego. */
    async listarCanciones(): Promise<CancionCatalogo[]> {
      const respuesta = await pedir("/api/songs/", { cache: "no-store" });
      const datos = await comoJson<{ songs: CancionCatalogo[] }>(respuesta);
      return datos.songs;
    },
  };
}
