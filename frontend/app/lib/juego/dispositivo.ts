const CLAVE = "banda-oriental:device-id";
const FORMATO_UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

let enMemoria: string | null = null;

function nuevoUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Alcanza con distinguir dispositivos anónimos entre sí: nunca se usa como secreto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (caracter) => {
    const azar = Math.floor(Math.random() * 16);
    return (caracter === "x" ? azar : (azar & 0x3) | 0x8).toString(16);
  });
}

/**
 * Identificador anónimo del dispositivo (UUID), guardado en el navegador. El backend lo usa para saber
 * quién ya jugó hoy. Si el navegador bloquea el almacenamiento, vale solo para esta visita.
 */
export function idDeDispositivo(): string {
  if (enMemoria) return enMemoria;
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (guardado && FORMATO_UUID.test(guardado)) {
      enMemoria = guardado;
      return guardado;
    }
    const nuevo = nuevoUuid();
    window.localStorage.setItem(CLAVE, nuevo);
    enMemoria = nuevo;
    return nuevo;
  } catch {
    enMemoria = nuevoUuid();
    return enMemoria;
  }
}
