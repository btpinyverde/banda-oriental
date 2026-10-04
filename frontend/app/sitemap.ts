import type { MetadataRoute } from "next";
import { SITIO_URL } from "./lib/seo";

/**
 * La portada y el juego. A medida que se sumen páginas con contenido hay que listarlas acá; listar rutas que
 * dan 404 o que no tienen nada para mostrar perjudica el rastreo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITIO_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITIO_URL}/jugar`, changeFrequency: "daily", priority: 0.9 },
  ];
}
