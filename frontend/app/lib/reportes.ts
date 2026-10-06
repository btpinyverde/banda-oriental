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
  /** El motivo elegido en el formulario de contacto. */
  reason?: string;
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

/** Manda el reporte; con imágenes va como formulario (multipart), sin ellas como JSON. */
export async function enviarReporte(reporte: Reporte, imagenes: File[] = []): Promise<Resultado> {
  // Los campos vacíos no se mandan (menos el escondido, que se manda vacío a propósito).
  const campos = Object.entries(reporte).filter(([clave, valor]) => clave === "website" || (valor !== undefined && valor !== ""));
  let opciones: RequestInit & { headers?: Record<string, string> };
  if (imagenes.length > 0) {
    const formulario = new FormData();
    for (const [clave, valor] of campos) formulario.append(clave, String(valor));
    for (const imagen of imagenes) formulario.append("images", imagen);
    // Sin tipo de contenido a mano: el navegador agrega el suyo con el límite de las partes.
    opciones = { method: "POST", body: formulario };
  } else {
    opciones = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(campos)) };
  }
  try {
    const respuesta = await pedirConPase("/api/catalog/reports/", opciones);
    return respuesta.ok ? { ok: true } : { ok: false, error: await motivo(respuesta) };
  } catch {
    return { ok: false, error: SIN_CONEXION };
  }
}
