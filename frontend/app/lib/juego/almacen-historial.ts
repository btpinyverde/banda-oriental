import { agregarPartida, type Partida } from "./historial";

// Clave propia, sin el prefijo de los datos del día en curso: aquellos se borran al cambiar de día y esto no.
const CLAVE = "banda-oriental:historial";

/** Evento (en la misma pestaña) que avisa que el historial cambió; en otras pestañas avisa el evento `storage`. */
export const EVENTO_HISTORIAL = "banda-oriental:historial-cambio";

const esTexto = (valor: unknown): valor is string => typeof valor === "string";

function esPartida(valor: unknown): valor is Partida {
  if (typeof valor !== "object" || valor === null) return false;
  const p = valor as Record<string, unknown>;
  const cancion = p.cancion as Record<string, unknown> | undefined;
  return (
    esTexto(p.dia) &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.dia) &&
    typeof p.ganada === "boolean" &&
    (p.intentos === null || typeof p.intentos === "number") &&
    typeof cancion === "object" &&
    cancion !== null &&
    esTexto(cancion.title) &&
    esTexto(cancion.artist) &&
    esTexto(cancion.album)
  );
}

/** Todo lo jugado en este dispositivo, del día más viejo al más nuevo. Vacío si no hay nada o los datos no sirven. */
export function leerHistorial(): Partida[] {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? datos.filter(esPartida) : [];
  } catch {
    return [];
  }
}

/** Suma una partida terminada al historial del dispositivo (una por día) y avisa a la pantalla. */
export function guardarPartida(partida: Partida) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(agregarPartida(leerHistorial(), partida)));
    window.dispatchEvent(new Event(EVENTO_HISTORIAL));
  } catch {
    // Almacenamiento bloqueado o lleno: se pierde el historial, pero el juego sigue andando.
  }
}
