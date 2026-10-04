import type { MetadataRoute } from "next";
import { PAGINAS_DE_TEXTO } from "./lib/paginas";
import { SITIO_URL } from "./lib/seo";

/**
 * La portada, el juego y las páginas con contenido. No se listan las que todavía dan "próximamente" ni las
 * personales (/historial): listar páginas vacías perjudica el rastreo.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITIO_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITIO_URL}/jugar`, changeFrequency: "daily", priority: 0.9 },
    ...PAGINAS_DE_TEXTO.map((pagina) => ({ url: `${SITIO_URL}/${pagina.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
