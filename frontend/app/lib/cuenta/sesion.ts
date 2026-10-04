/**
 * La sesión de la cuenta: el token que devuelve la API y el correo, guardados en este navegador. Clave propia: no se
 * mezcla con el historial (permanente) ni con los datos del día en curso (se borran al cambiar de día).
 *
 * El token queda en localStorage porque el sitio y la API están en dominios distintos (decisión del diseño de cuentas,
 * docs/superpowers/specs/2026-10-03-cuentas-design.md). Por eso el sitio no carga scripts de terceros.
 */
const CLAVE = "banda-oriental:sesion";

export interface Sesion {
  token: string;
  email: string;
}

/** Evento (en la misma pestaña) que avisa que la sesión cambió; en otras pestañas avisa el evento `storage`. */
export const EVENTO_SESION = "banda-oriental:sesion-cambio";

export function leerSesion(): Sesion | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const datos: unknown = JSON.parse(crudo);
    if (typeof datos !== "object" || datos === null) return null;
    const { token, email } = datos as Record<string, unknown>;
    if (typeof token !== "string" || token === "") return null;
    return { token, email: typeof email === "string" ? email : "" };
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: Sesion): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(sesion));
    window.dispatchEvent(new Event(EVENTO_SESION));
  } catch {
    // Almacenamiento bloqueado: no se puede mantener la sesión, pero no hay que romper la pantalla.
  }
}

export function borrarSesion(): void {
  try {
    window.localStorage.removeItem(CLAVE);
    window.dispatchEvent(new Event(EVENTO_SESION));
  } catch {
    // Igual que arriba.
  }
}
