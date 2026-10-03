import { ALT_COMPARTIR, crearImagenCompartir } from "./lib/imagen-compartir";

// Igual que opengraph-image: X/Twitter pide su propia imagen, con el mismo contenido.
export const alt = ALT_COMPARTIR;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return crearImagenCompartir();
}
