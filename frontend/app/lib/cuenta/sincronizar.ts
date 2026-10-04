import { guardarPartida } from "../juego/almacen-historial";
import type { Partida } from "../juego/historial";
import { ApiError, type Feedback } from "../juego/tipos";
import type { ApiCuenta, DiaDeCuenta } from "./api-cuenta";
import { borrarSesion } from "./sesion";

/** El día de la cuenta como se guarda en el dispositivo; `null` si el día no terminó (todavía no se conoce la canción). */
export function partidaDeCuenta(dia: DiaDeCuenta): Partida | null {
  if (!dia.finished || !dia.song) return null;
  return {
    dia: dia.day,
    ganada: dia.won,
    intentos: dia.won ? dia.winning_attempt : null,
    cancion: { title: dia.song.title, artist: dia.song.artist, album: dia.song.album },
    feedback: dia.attempts.map((intento) => intento.feedback as Feedback),
    ...(dia.score !== null ? { puntaje: dia.score } : {}),
  };
}

/**
 * Trae el historial de la cuenta y lo suma al del dispositivo, que es el que muestran las pantallas. El servidor
 * ya tiene las partidas de este dispositivo (se asociaron al entrar), así que no hace falta subir nada. Si la sesión
 * ya no sirve (401) se cierra; cualquier otro fallo se ignora y se reintenta la próxima vez.
 */
export async function sincronizarHistorial(api: ApiCuenta, token: string): Promise<void> {
  try {
    for (const dia of await api.historial(token)) {
      const partida = partidaDeCuenta(dia);
      if (partida) guardarPartida(partida);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) borrarSesion();
  }
}
