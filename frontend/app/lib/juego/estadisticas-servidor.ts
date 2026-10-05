import { comoJson } from "./http";
import { pedirDelJuego } from "./pedir-del-juego";
import type { Destacados, EstadisticasGlobales, EstadisticasServidor, PeriodoRanking, RankingServidor } from "./tipos";

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

/** Las mejores rachas y quiénes jugaron más canciones (para las listas laterales del ranking). */
export async function pedirDestacados(): Promise<Destacados> {
  const respuesta = await pedirDelJuego("/api/leaderboard/highlights/", { cache: "no-store" });
  return comoJson<Destacados>(respuesta);
}

/** Jugadores, partidas y días del juego (para las estadísticas globales del ranking). */
export async function pedirGlobales(): Promise<EstadisticasGlobales> {
  const respuesta = await pedirDelJuego("/api/stats/global/", { cache: "no-store" });
  return comoJson<EstadisticasGlobales>(respuesta);
}

/**
 * Cambia el nombre con el que se aparece en los rankings (el de la cuenta si hay sesión; si no, el del dispositivo).
 * Las reglas las pone el servidor (filtro de palabras, nombre único, espera entre cambios): si rechaza, el mensaje
 * viene en el error y se muestra tal cual.
 */
export async function cambiarNombre(idDispositivo: string, nombre: string): Promise<EstadisticasServidor> {
  const respuesta = await pedirDelJuego(
    "/api/stats/name/",
    {
      method: "PUT",
      headers: { "X-Device-Id": idDispositivo, "Content-Type": "application/json" },
      body: JSON.stringify({ public_name: nombre }),
    },
    true,
    false, // si la sesión venció, no se repite como anónimo: cambiaría el nombre del dispositivo y no el de la cuenta
  );
  return comoJson<EstadisticasServidor>(respuesta);
}
