import type { MetadataRoute } from "next";
import { obtenerDias } from "./lib/anteriores";
import { listarArtistas, listarDiscos, rutaDeArtista, rutaDeDisco, type Pagina } from "./lib/archivo-musical";
import { PAGINAS_DE_TEXTO } from "./lib/paginas";
import { SITIO_URL } from "./lib/seo";

/**
 * La portada, el juego, el ranking, el archivo con una entrada por cada día vencido, las páginas de explorar el catálogo (contenido real e indexable:
 * "la canción uruguaya del día X fue Y") y las páginas con contenido. No se listan las que todavía dan
 * "próximamente" ni las personales (/historial): listar páginas vacías perjudica el rastreo. Si la API del archivo
 * no responde, el sitemap sale igual, sin los días.
 */
const MAXIMO_DE_PAGINAS = 60;
const POR_PAGINA = 50;

/**
 * Todas las páginas de una lista de la API: la primera dice cuántas hay y las demás se piden juntas. Si alguna no
 * responde se sigue con lo que hay (el sitemap tiene que salir igual).
 */
async function todas<T>(pedir: (pagina: number, porPagina: number) => Promise<Pagina<T> | null>): Promise<T[]> {
  const primera = await pedir(1, POR_PAGINA);
  if (!primera) return [];
  const resto = await Promise.all(Array.from({ length: Math.min(primera.pages, MAXIMO_DE_PAGINAS) - 1 }, (_, i) => pedir(i + 2, POR_PAGINA)));
  return [...primera.results, ...resto.flatMap((p) => p?.results ?? [])];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dias, artistas, discos] = await Promise.all([
    obtenerDias().then((d) => d ?? []),
    todas((pagina, porPagina) => listarArtistas({ pagina, porPagina })),
    todas((pagina, porPagina) => listarDiscos({ pagina, porPagina })),
  ]);
  return [
    { url: `${SITIO_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITIO_URL}/jugar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITIO_URL}/ranking`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITIO_URL}/anteriores`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITIO_URL}/archivo`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITIO_URL}/archivo/artistas`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITIO_URL}/archivo/discos`, changeFrequency: "weekly", priority: 0.6 },
    ...artistas.map((a) => ({ url: `${SITIO_URL}${rutaDeArtista(a)}`, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...discos.map((d) => ({ url: `${SITIO_URL}${rutaDeDisco(d)}`, changeFrequency: "monthly" as const, priority: 0.4 })),
    { url: `${SITIO_URL}/artistas`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITIO_URL}/epocas`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITIO_URL}/generos`, changeFrequency: "weekly", priority: 0.4 },
    ...dias.map((dia) => ({ url: `${SITIO_URL}/anteriores/${dia.date}`, changeFrequency: "yearly" as const, priority: 0.5 })),
    ...PAGINAS_DE_TEXTO.map((pagina) => ({ url: `${SITIO_URL}/${pagina.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
