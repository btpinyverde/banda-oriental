import { pedir } from "../juego/http";
import { comprobacionHumanaActiva, obtenerPase, olvidarPase } from "./pase";

type Opciones = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

async function pideComprobacion(respuesta: Response): Promise<boolean> {
  try {
    const copia = typeof respuesta.clone === "function" ? respuesta.clone() : respuesta;
    return (await copia.json()).code === "human_check_required";
  } catch {
    return false;
  }
}

/**
 * Como `pedir`, pero con el pase de comprobación humana (si está activa). Si la API dice que el pase no sirve (venció,
 * o cambió la red del celular) consigue otro y repite una sola vez.
 */
export async function pedirConPase(ruta: string, opciones: Opciones = {}): Promise<Response> {
  const intentar = async () => {
    const pase = await obtenerPase();
    return pedir(ruta, { ...opciones, headers: { ...opciones.headers, ...(pase ? { "X-Human-Pass": pase } : {}) } });
  };
  const respuesta = await intentar();
  if (respuesta.status === 403 && comprobacionHumanaActiva() && (await pideComprobacion(respuesta))) {
    olvidarPase();
    return intentar();
  }
  return respuesta;
}
