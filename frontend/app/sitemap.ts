import type { MetadataRoute } from "next";
import { SITIO_URL } from "./lib/seo";

/**
 * Solo la portada, que es la única página que existe. A medida que se creen /jugar, /archivo, etc.
 * hay que sumarlas acá; listar rutas que dan 404 perjudica el rastreo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITIO_URL}/`, changeFrequency: "daily", priority: 1 }];
}
