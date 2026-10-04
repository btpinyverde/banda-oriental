import { comoJson } from "./http";
import { pedirDelJuego } from "./pedir-del-juego";
import type { EstadisticasServidor, PeriodoRanking, RankingServidor } from "./tipos";

/**
 * Las estadísticas de quien juega, tal como las calculó y guardó el servidor (con la sesión si hay una; si no, las
 * del dispositivo). El front no calcula ni manda estadísticas: solo las pide y las muestra.
 */
export async function pedirEstadisticas(idDispositivo: string): Promise<EstadisticasServidor> {
  const respuesta = await pedirDelJuego("/api/stats/", { headers: { "X-Device-Id": idDispositivo }, cache: "no-store" });
  return comoJson<EstadisticasServidor>(respuesta);
}

/** El ranking de un período. Con sesión o identificador de dispositivo, el servidor suma el puesto propio (`me`). */
export async function pedirRanking(periodo: PeriodoRanking, idDispositivo?: string): Promise<RankingServidor> {
  const respuesta = await pedirDelJuego(`/api/leaderboard/?period=${periodo}`, {
    headers: idDispositivo ? { "X-Device-Id": idDispositivo } : {},
    cache: "no-store",
  });
  return comoJson<RankingServidor>(respuesta);
}
