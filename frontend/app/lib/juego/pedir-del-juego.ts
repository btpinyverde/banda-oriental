import { borrarSesion, leerSesion } from "../cuenta/sesion";
import { pedirConPase } from "../humano/pedir-con-pase";
import { pedir } from "./http";

type Opciones = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

/**
 * Pide algo del juego con la sesión de la cuenta, si hay una. Si la API dice 401 (la sesión venció o se cerró en otro
 * dispositivo) se borra y el pedido se repite una vez sin sesión: la persona sigue jugando como anónima.
 */
export async function pedirDelJuego(
  ruta: string,
  opciones: Opciones = {},
  conComprobacion = false,
  /** Con `false`, si la sesión venció se borra y se devuelve el 401: el pedido no se repite como anónimo (para lo que solo vale con la cuenta). */
  repetirSinSesion = true,
): Promise<Response> {
  const enviar = conComprobacion ? pedirConPase : pedir;
  const sesion = leerSesion();
  const respuesta = await enviar(ruta, {
    ...opciones,
    headers: { ...opciones.headers, ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}) },
  });
  if (respuesta.status !== 401 || !sesion) return respuesta;
  borrarSesion();
  return repetirSinSesion ? enviar(ruta, opciones) : respuesta;
}
