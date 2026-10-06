import { pedirConPase } from "./humano/pedir-con-pase";

/** Lo que se manda desde el archivo: un error que se encontró, una banda que quiere sumarse o un mensaje. */
export interface Reporte {
  kind: "error" | "alta" | "contacto";
  target_type?: "artist" | "album" | "song";
  target_id?: number;
  target_label?: string;
  name?: string;
  contact?: string;
  links?: string;
  message?: string;
  /** El campo escondido que solo completan los bots: tiene que ir vacío. */
  website?: string;
}

export type Resultado = { ok: true } | { ok: false; error: string };

const SIN_CONEXION = "No se pudo enviar. Revisá tu conexión y probá de nuevo.";

/** Lo que dijo la API cuando rechazó el pedido, en español; si no se entiende, un texto general. */
async function motivo(respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json();
    if (typeof cuerpo.detail === "string") return cuerpo.detail;
    const textos = Object.values(cuerpo).flat().filter((v): v is string => typeof v === "string");
    if (textos.length) return textos.join(" ");
  } catch {
    /* sin cuerpo legible */
  }
  return "No se pudo enviar. Probá de nuevo en un rato.";
}

export async function enviarReporte(reporte: Reporte): Promise<Resultado> {
  // Los campos vacíos no se mandan (menos el escondido, que se manda vacío a propósito).
  const cuerpo = Object.fromEntries(Object.entries(reporte).filter(([clave, valor]) => clave === "website" || (valor !== undefined && valor !== "")));
  try {
    const respuesta = await pedirConPase("/api/catalog/reports/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    return respuesta.ok ? { ok: true } : { ok: false, error: await motivo(respuesta) };
  } catch {
    return { ok: false, error: SIN_CONEXION };
  }
}
