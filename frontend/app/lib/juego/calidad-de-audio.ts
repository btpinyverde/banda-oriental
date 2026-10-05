/** Cada pista existe en dos versiones: la buena ("high") y una más liviana ("low") para conexiones lentas. */
export type Calidad = "high" | "low";

/** Lo que algunos navegadores (Chrome, Android) dicen de la conexión. Safari y Firefox no lo informan. */
export interface Conexion {
  effectiveType?: string;
  saveData?: boolean;
}

/** Por debajo de esta velocidad medida (bytes por segundo, unos 2 Mbit/s) conviene la versión liviana. */
export const UMBRAL_LENTO = 250_000;

const CONEXIONES_LENTAS = new Set(["slow-2g", "2g", "3g"]);
// Fuera del prefijo del juego (`banda-oriental:juego:`), que se limpia al cambiar de día.
const CLAVE_AHORRO = "banda-oriental:ahorrar-datos";

/**
 * Elige la versión de las pistas. Manda lo que pidió la persona; después lo que informa el navegador; y como no
 * todos lo informan, la velocidad a la que bajó la última pista.
 */
export function elegirCalidad({ ahorrar, conexion, velocidad }: { ahorrar: boolean; conexion?: Conexion; velocidad?: number }): Calidad {
  if (ahorrar) return "low";
  if (conexion?.saveData) return "low";
  if (conexion?.effectiveType && CONEXIONES_LENTAS.has(conexion.effectiveType)) return "low";
  if (velocidad !== undefined && velocidad < UMBRAL_LENTO) return "low";
  return "high";
}

export function leerAhorro(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_AHORRO) === "1";
  } catch {
    return false;
  }
}

export function guardarAhorro(valor: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_AHORRO, valor ? "1" : "0");
  } catch {
    // Almacenamiento bloqueado: la elección vale mientras la página siga abierta.
  }
}

/** Lo que el navegador informa de la conexión, si lo informa. */
export function conexionDelNavegador(): Conexion | undefined {
  return (navigator as Navigator & { connection?: Conexion }).connection;
}
