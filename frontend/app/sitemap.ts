import type { MetadataRoute } from "next";
import { obtenerDias } from "./lib/archivo";
import { PAGINAS_DE_TEXTO } from "./lib/paginas";
import { SITIO_URL } from "./lib/seo";

/**
 * La portada, el juego, el ranking, el archivo con una entrada por cada día vencido (contenido real e indexable:
 * "la canción uruguaya del día X fue Y") y las páginas con contenido. No se listan las que todavía dan
 * "próximamente" ni las personales (/historial): listar páginas vacías perjudica el rastreo. Si la API del archivo
 * no responde, el sitemap sale igual, sin los días.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dias = (await obtenerDias()) ?? [];
  return [
    { url: `${SITIO_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITIO_URL}/jugar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITIO_URL}/ranking`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITIO_URL}/archivo`, changeFrequency: "daily", priority: 0.7 },
    ...dias.map((dia) => ({ url: `${SITIO_URL}/archivo/${dia.date}`, changeFrequency: "yearly" as const, priority: 0.5 })),
    ...PAGINAS_DE_TEXTO.map((pagina) => ({ url: `${SITIO_URL}/${pagina.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
