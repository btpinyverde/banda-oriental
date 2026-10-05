/** Cada pista existe en dos versiones: la buena ("high") y una más liviana ("low") para conexiones lentas. */
export type Calidad = "high" | "low";

/** Lo que algunos navegadores (Chrome, Android) dicen de la conexión. Safari y Firefox no lo informan. */
export interface Conexion {
  effectiveType?: string;
  saveData?: boolean;
  /** Ancho de banda estimado, en Mbit/s. */
  downlink?: number;
}

/** Por debajo de esta velocidad medida (bytes por segundo, unos 2 Mbit/s) conviene la versión liviana. */
export const UMBRAL_LENTO = 250_000;
/** Lo mismo, para el ancho de banda que informa el navegador (Mbit/s). */
const DOWNLINK_LENTO = 2;

const CONEXIONES_LENTAS = new Set(["slow-2g", "2g", "3g"]);

/**
 * Elige la versión de una pista en el momento de bajarla, según la conexión: lo que informa el navegador si lo informa
 * (Chrome, Android: conexión lenta, ahorro de datos activado en el sistema o poco ancho de banda) y, como no todos lo
 * informan (Safari, Firefox), la velocidad a la que bajó la última pista. Sin ningún dato, la buena.
 */
export function elegirCalidad({ conexion, velocidad }: { conexion?: Conexion; velocidad?: number }): Calidad {
  if (conexion?.saveData) return "low";
  if (conexion?.effectiveType && CONEXIONES_LENTAS.has(conexion.effectiveType)) return "low";
  if (conexion?.downlink !== undefined && conexion.downlink > 0 && conexion.downlink < DOWNLINK_LENTO) return "low";
  if (velocidad !== undefined && velocidad < UMBRAL_LENTO) return "low";
  return "high";
}

/** Lo que el navegador informa de la conexión, si lo informa. */
export function conexionDelNavegador(): Conexion | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Conexion }).connection;
}

// La velocidad de la última descarga, en memoria mientras la página siga abierta: con ella se elige la calidad de las
// pistas que se bajan después (cada intento desbloquea una).
let velocidadMedida: number | undefined;

export function registrarVelocidad(bytesPorSegundo: number): void {
  velocidadMedida = bytesPorSegundo;
}

export function olvidarVelocidad(): void {
  velocidadMedida = undefined;
}

/** La calidad que corresponde bajar ahora. */
export function calidadActual(): Calidad {
  return elegirCalidad({ conexion: conexionDelNavegador(), velocidad: velocidadMedida });
}
