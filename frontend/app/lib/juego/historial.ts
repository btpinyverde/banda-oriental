import type { Feedback } from "./tipos";

/** Una partida terminada, tal como se guarda en el dispositivo. Hay como mucho una por día. */
export interface Partida {
  /** Día de la canción, "2026-10-03". */
  dia: string;
  /** Número del juego (#138), si el backend lo informa. */
  numero?: number;
  ganada: boolean;
  /** Cuántos intentos se usaron; `null` si no se sabe (por ejemplo, si se volvió a abrir un día ya terminado). */
  intentos: number | null;
  cancion: { title: string; artist: string; album: string };
  /** El color de cada celda de cada intento, en orden. Falta si no se conoce. */
  feedback?: Feedback[];
  puntaje?: number;
}

export interface Estadisticas {
  jugadas: number;
  ganadas: number;
  /** Porcentaje de partidas ganadas (0 a 100), o `null` si todavía no se jugó. */
  porcentaje: number | null;
  rachaActual: number;
  rachaMaxima: number;
  /** Cuántas partidas se ganaron en 1, 2, ... 6 intentos. */
  distribucion: number[];
}

export type EstadoDia = "ganada" | "perdida" | "sin-jugar" | "pendiente";

const INTENTOS_MAXIMOS = 6;
const MS_POR_DIA = 86_400_000;

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);

export function diaAnterior(dia: string): string {
  return aDia(new Date(aFecha(dia).getTime() - MS_POR_DIA));
}

/**
 * Suma una partida al historial. Hay una sola por día: si ya estaba, se completa lo que faltaba (intentos,
 * colores, puntaje) sin pisar lo que ya se sabía. Devuelve una lista nueva, ordenada de la más vieja a la más nueva.
 */
export function agregarPartida(historial: Partida[], nueva: Partida): Partida[] {
  const existente = historial.find((p) => p.dia === nueva.dia);
  const resto = historial.filter((p) => p.dia !== nueva.dia);
  const unida: Partida = existente
    ? {
        ...nueva,
        ...existente,
        numero: existente.numero ?? nueva.numero,
        intentos: existente.intentos ?? nueva.intentos,
        feedback: existente.feedback?.length ? existente.feedback : nueva.feedback,
        puntaje: existente.puntaje ?? nueva.puntaje,
      }
    : nueva;
  return [...resto, unida].sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Largo de la tanda de días ganados seguidos que termina en `fin`. */
function tandaQueTerminaEn(ganados: Set<string>, fin: string): number {
  let dia = fin;
  let largo = 0;
  while (ganados.has(dia)) {
    largo += 1;
    dia = diaAnterior(dia);
  }
  return largo;
}

/**
 * Estadísticas del dispositivo. La racha cuenta días seguidos ganando: si hoy todavía no se jugó, no la corta
 * (se cuenta desde ayer); si hoy se jugó y se perdió, vuelve a cero.
 */
export function estadisticas(historial: Partida[], hoy: string): Estadisticas {
  const ganados = new Set(historial.filter((p) => p.ganada).map((p) => p.dia));
  const jugadas = historial.length;

  const distribucion = new Array<number>(INTENTOS_MAXIMOS).fill(0);
  for (const p of historial) {
    if (p.ganada && p.intentos !== null && p.intentos >= 1 && p.intentos <= INTENTOS_MAXIMOS) distribucion[p.intentos - 1] += 1;
  }

  const hoyJugado = historial.some((p) => p.dia === hoy);
  const rachaActual = tandaQueTerminaEn(ganados, hoyJugado ? hoy : diaAnterior(hoy));

  let rachaMaxima = 0;
  for (const dia of ganados) {
    // Solo se mide desde el comienzo de cada tanda (el día anterior no está ganado), para no repetir cuentas.
    if (!ganados.has(diaAnterior(dia))) {
      let largo = 0;
      let actual = dia;
      while (ganados.has(actual)) {
        largo += 1;
        actual = aDia(new Date(aFecha(actual).getTime() + MS_POR_DIA));
      }
      rachaMaxima = Math.max(rachaMaxima, largo);
    }
  }

  return {
    jugadas,
    ganadas: ganados.size,
    porcentaje: jugadas === 0 ? null : Math.round((ganados.size / jugadas) * 100),
    rachaActual,
    rachaMaxima,
    distribucion,
  };
}

/** Promedio de intentos de las partidas ganadas (con un decimal), o `null` si todavía no hay ninguna. */
export function promedioIntentos(distribucion: number[]): number | null {
  const ganadas = distribucion.reduce((suma, n) => suma + n, 0);
  if (ganadas === 0) return null;
  const total = distribucion.reduce((suma, n, i) => suma + n * (i + 1), 0);
  return Math.round((total / ganadas) * 10) / 10;
}

/** Los últimos `cantidad` días hasta hoy, del más viejo al más nuevo, con cómo le fue a la persona cada uno. */
export function ultimosDias(historial: Partida[], hoy: string, cantidad: number): { dia: string; estado: EstadoDia }[] {
  const dias: string[] = [];
  for (let dia = hoy, i = 0; i < cantidad; dia = diaAnterior(dia), i++) dias.unshift(dia);

  return dias.map((dia) => {
    const partida = historial.find((p) => p.dia === dia);
    if (partida) return { dia, estado: partida.ganada ? "ganada" : "perdida" };
    return { dia, estado: dia === hoy ? "pendiente" : "sin-jugar" };
  });
}
