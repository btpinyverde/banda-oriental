/**
 * El catálogo para explorarlo (artistas, épocas y géneros). Sale de la misma lista de canciones que usa el buscador
 * del juego (`GET /api/songs/`), que no dice cuál es la canción del día. Se lee en el servidor, se junta por disco y
 * queda en caché diez minutos. Si la API no responde se devuelve `null` y la página lo explica.
 */

export interface DiscoDelCatalogo {
  artista: string;
  disco: string;
  anio: number | null;
  genero: string;
  canciones: number;
}

interface CancionDeLaApi {
  artist: string;
  album: string;
  year: number | null;
  genre: string;
}

const base = () => (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
const DIEZ_MINUTOS = 600;

/** Todas las canciones juntadas por disco; `null` si no se pudo consultar. */
export async function obtenerDiscos(): Promise<DiscoDelCatalogo[] | null> {
  let canciones: CancionDeLaApi[];
  try {
    const respuesta = await fetch(`${base()}/api/songs/`, { next: { revalidate: DIEZ_MINUTOS } });
    if (!respuesta.ok) return null;
    canciones = (await respuesta.json()).songs as CancionDeLaApi[];
  } catch {
    return null;
  }

  const discos = new Map<string, DiscoDelCatalogo>();
  for (const cancion of canciones) {
    const clave = `${cancion.artist}\u0000${cancion.album}\u0000${cancion.year ?? ""}`;
    const existente = discos.get(clave);
    if (existente) existente.canciones += 1;
    else discos.set(clave, { artista: cancion.artist, disco: cancion.album, anio: cancion.year, genero: cancion.genre ?? "", canciones: 1 });
  }
  return [...discos.values()];
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
    grupos.set(clave, [...(grupos.get(clave) ?? []), disco]);
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
