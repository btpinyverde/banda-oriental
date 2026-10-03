import { ALT_COMPARTIR, crearImagenCompartir } from "./lib/imagen-compartir";

// Los valores de configuración tienen que ser literales: Next los lee sin ejecutar el archivo.
export const alt = ALT_COMPARTIR;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return crearImagenCompartir();
}
