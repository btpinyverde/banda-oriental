import type { MetadataRoute } from "next";
import { COLOR_FONDO, DESCRIPCION, IDIOMA, NOMBRE } from "./lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE,
    short_name: NOMBRE,
    description: DESCRIPCION,
    start_url: "/",
    display: "standalone",
    lang: IDIOMA,
    background_color: COLOR_FONDO,
    theme_color: COLOR_FONDO,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
