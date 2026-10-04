/**
 * El catálogo para explorarlo (artistas, épocas y géneros). Viene del servidor ya juntado por disco y no dice cuál es
 * la canción del día. Se lee en el servidor y queda en caché diez minutos. Si la API no responde se devuelve `null` y
 * la página lo explica.
 */

export interface DiscoDelCatalogo {
  artista: string;
  disco: string;
  anio: number | null;
  genero: string;
  canciones: number;
}

interface DiscoDeLaApi {
  artist: string;
  album: string;
  year: number | null;
  genre: string;
  songs: number;
}

const base = () => (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
const DIEZ_MINUTOS = 600;
// Si la API tarda (el servidor gratuito se duerme) no se espera para siempre: ni armar la página ni armar el sitio deben
// colgarse. Pasado este tiempo la página avisa y se renueva sola.
const ESPERA_MAXIMA_MS = 20_000;

/**
 * Los discos del catálogo, ya juntados por el servidor (`GET /api/albums/`: unos pocos cientos de KB aunque el catálogo
 * crezca, a diferencia de la lista de todas las canciones, que podía pasar el límite de la caché de Next); `null` si
 * no se pudo consultar o la respuesta no tiene la forma esperada.
 */
export async function obtenerDiscos(): Promise<DiscoDelCatalogo[] | null> {
  try {
    const respuesta = await fetch(`${base()}/api/albums/`, { next: { revalidate: DIEZ_MINUTOS }, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
    if (!respuesta.ok) return null;
    const discos = (await respuesta.json()).albums;
    if (!Array.isArray(discos)) return null;
    return (discos as DiscoDeLaApi[]).map((d) => ({ artista: d.artist, disco: d.album, anio: d.year, genero: d.genre ?? "", canciones: d.songs }));
  } catch {
    return null;
  }
}

const comparar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
const porAnio = (a: DiscoDelCatalogo, b: DiscoDelCatalogo) => (a.anio ?? 9999) - (b.anio ?? 9999) || comparar(a.disco, b.disco);

export interface GrupoDeDiscos {
  clave: string;
  etiqueta: string;
  discos: DiscoDelCatalogo[];
}

export interface GrupoDeArtista extends GrupoDeDiscos {
  nombre: string;
  cantidadDeDiscos: number;
  cantidadDeCanciones: number;
}

function agrupar(discos: DiscoDelCatalogo[], claveDe: (disco: DiscoDelCatalogo) => string): Map<string, DiscoDelCatalogo[]> {
  const grupos = new Map<string, DiscoDelCatalogo[]>();
  for (const disco of discos) {
    const clave = claveDe(disco);
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(disco);
    else grupos.set(clave, [disco]);
  }
  return grupos;
}

/** Artistas por orden alfabético, cada uno con sus discos del más viejo al más nuevo. */
export function porArtista(discos: DiscoDelCatalogo[]): GrupoDeArtista[] {
  return [...agrupar(discos, (d) => d.artista)]
    .map(([nombre, delArtista]) => ({
      clave: nombre,
      etiqueta: nombre,
      nombre,
      discos: [...delArtista].sort(porAnio),
      cantidadDeDiscos: delArtista.length,
      cantidadDeCanciones: delArtista.reduce((suma, d) => suma + d.canciones, 0),
    }))
    .sort((a, b) => comparar(a.nombre, b.nombre));
}

/** Décadas de la más nueva a la más vieja (los discos sin año, al final), cada una con sus discos del más viejo al más nuevo. */
export function porDecada(discos: DiscoDelCatalogo[]): GrupoDeDiscos[] {
  const grupos = agrupar(discos, (d) => (d.anio === null ? "sin-anio" : String(Math.floor(d.anio / 10) * 10)));
  return [...grupos]
    .map(([clave, delGrupo]) => ({ clave, etiqueta: clave === "sin-anio" ? "Sin año" : `Años ${clave}`, discos: [...delGrupo].sort(porAnio) }))
    .sort((a, b) => (a.clave === "sin-anio" ? 1 : b.clave === "sin-anio" ? -1 : Number(b.clave) - Number(a.clave)));
}

/** Géneros del que tiene más discos al que tiene menos (los discos sin género, al final). */
export function porGenero(discos: DiscoDelCatalogo[]): GrupoDeDiscos[] {
  const grupos = agrupar(discos, (d) => d.genero.trim().toLowerCase() || "sin-genero");
  return [...grupos]
    .map(([clave, delGrupo]) => ({ clave, etiqueta: clave === "sin-genero" ? "Sin género" : clave, discos: [...delGrupo].sort(porAnio) }))
    .sort((a, b) => (a.clave === "sin-genero" ? 1 : b.clave === "sin-genero" ? -1 : b.discos.length - a.discos.length || comparar(a.etiqueta, b.etiqueta)));
}
