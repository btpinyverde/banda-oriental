/**
 * El archivo de música: buscar y explorar artistas, discos y canciones del catálogo. Las listas y las fichas se leen en el
 * servidor (la página llega con el contenido en el HTML, para los buscadores y las vistas previas) y quedan en caché unos
 * minutos; la búsqueda mientras se escribe se hace desde el navegador, sin caché. Si la API no responde las funciones de
 * servidor devuelven `null` y la página lo explica. La API no dice nunca cuál es la canción del día.
 */

// ---------- Lo que devuelve la API (docs/contrato-api-archivo.md) ----------

export interface ArtistaFila {
  id: number;
  name: string;
  albums: number;
  songs: number;
  first_year: number | null;
  last_year: number | null;
  /** La tapa de su disco más reciente que tenga; vacía si ninguno tiene (nunca se inventa una). */
  cover_art_url: string;
  /** Su foto (de Deezer, por https); vacía si no tiene. */
  picture_url: string;
}

export interface DiscoFila {
  id: number;
  name: string;
  artist: { id: number; name: string };
  year: number | null;
  genre: string;
  release_type: string;
  songs: number;
  cover_art_url: string;
}

export interface CancionFila {
  id: number;
  title: string;
  duration_seconds: number | null;
  artist: { id: number; name: string };
  album: { id: number; name: string; year: number | null; genre: string };
  /** Lista: el último día vencido en que fue la canción del día. Ficha: todos esos días. Nunca hoy ni días futuros. */
  played_on: string | string[] | null;
}

export interface Pagina<T> {
  count: number;
  page: number;
  pages: number;
  results: T[];
}

/** El detalle de un artista: igual que en la lista, pero `albums` trae los discos en vez de la cantidad. */
export type FichaDeArtista = Omit<ArtistaFila, "albums"> & { albums: DiscoFila[] };
/** El detalle de un disco: `songs` trae las canciones en vez de la cantidad. */
export type FichaDeDisco = Omit<DiscoFila, "songs"> & { songs: { id: number; title: string; duration_seconds: number | null }[] };
/** El detalle de una canción: `played_on` es la lista de días vencidos en que fue la del día. */
export type FichaDeCancion = Omit<CancionFila, "played_on"> & { played_on: string[] };

export interface Busqueda {
  q: string;
  artists: { results: ArtistaFila[]; total: number };
  albums: { results: DiscoFila[]; total: number };
  songs: { results: CancionFila[]; total: number };
}

export interface Filtros {
  decades: { decade: number; albums: number }[];
  genres: { genre: string; albums: number }[];
  years: { min: number | null; max: number | null };
}

// ---------- Direcciones de las fichas ----------

/** Texto para la dirección: minúsculas, sin tildes ni signos, con guiones. Vacío si no queda nada aprovechable. */
export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const ruta = (tipo: string, id: number, nombre: string) => {
  const texto = slug(nombre);
  return `/archivo/${tipo}/${id}${texto ? `-${texto}` : ""}`;
};
export const rutaDeArtista = (a: { id: number; name: string }) => ruta("artista", a.id, a.name);
export const rutaDeDisco = (d: { id: number; name: string }) => ruta("disco", d.id, d.name);
export const rutaDeCancion = (c: { id: number; title: string }) => ruta("cancion", c.id, c.title);

/** El id de una ficha, del tramo de la dirección ("7-jorge-drexler"). Solo se usa el número: lo demás nunca llega a la API. */
export function idDeFicha(tramo: string): number | null {
  const coincide = /^([1-9]\d{0,9})(?:-.*)?$/.exec(tramo);
  return coincide ? Number(coincide[1]) : null;
}

// ---------- Pedidos ----------

const base = () => (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
const DIEZ_MINUTOS = 600;
// El servidor gratuito se duerme y puede tardar casi un minuto en despertar: al armar la página (o el sitio) no se espera
// tanto; se sigue sin datos y la página avisa y se renueva sola.
const ESPERA_MAXIMA_MS = 20_000;

function consulta(parametros: Record<string, string | number | undefined>): string {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== "" && !(typeof valor === "number" && Number.isNaN(valor))) busqueda.set(clave, String(valor));
  }
  const texto = busqueda.toString();
  return texto ? `?${texto}` : "";
}

async function pedir(ruta: string): Promise<{ estado: "ok"; cuerpo: unknown } | { estado: "no-encontrado" } | { estado: "error" }> {
  try {
    const respuesta = await fetch(`${base()}${ruta}`, { next: { revalidate: DIEZ_MINUTOS }, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
    if (respuesta.status === 404) return { estado: "no-encontrado" };
    if (!respuesta.ok) return { estado: "error" };
    return { estado: "ok", cuerpo: await respuesta.json() };
  } catch {
    return { estado: "error" };
  }
}

const esPagina = (cuerpo: unknown): cuerpo is Pagina<never> =>
  typeof cuerpo === "object" && cuerpo !== null && Array.isArray((cuerpo as Pagina<unknown>).results) && typeof (cuerpo as Pagina<unknown>).count === "number";

async function lista<T>(ruta: string): Promise<Pagina<T> | null> {
  const respuesta = await pedir(ruta);
  return respuesta.estado === "ok" && esPagina(respuesta.cuerpo) ? (respuesta.cuerpo as Pagina<T>) : null;
}

export const listarArtistas = (f: { q?: string; letra?: string; orden?: "name" | "songs"; pagina?: number; porPagina?: number }) =>
  lista<ArtistaFila>(`/api/catalog/artists/${consulta({ q: f.q, letter: f.letra, sort: f.orden, page: f.pagina, page_size: f.porPagina })}`);

export const listarDiscos = (f: { q?: string; decada?: number; anio?: number; genero?: string; artista?: number; orden?: "name" | "year"; pagina?: number; porPagina?: number }) =>
  lista<DiscoFila>(`/api/catalog/albums/${consulta({ q: f.q, decade: f.decada, year: f.anio, genre: f.genero, artist: f.artista, sort: f.orden, page: f.pagina, page_size: f.porPagina })}`);

export const listarCanciones = (f: { q?: string; artista?: number; disco?: number; decada?: number; genero?: string; pagina?: number }) =>
  lista<CancionFila>(`/api/catalog/songs/${consulta({ q: f.q, artist: f.artista, album: f.disco, decade: f.decada, genre: f.genero, page: f.pagina })}`);

export type Resultado<T> = T | "no-encontrado" | null;

async function ficha<T>(ruta: string, valida: (cuerpo: Record<string, unknown>) => boolean): Promise<Resultado<T>> {
  const respuesta = await pedir(ruta);
  if (respuesta.estado === "no-encontrado") return "no-encontrado";
  if (respuesta.estado !== "ok" || typeof respuesta.cuerpo !== "object" || respuesta.cuerpo === null) return null;
  return valida(respuesta.cuerpo as Record<string, unknown>) ? (respuesta.cuerpo as T) : null;
}

export const fichaDeArtista = (id: number) =>
  ficha<FichaDeArtista>(`/api/catalog/artists/${id}/`, (c) => typeof c.name === "string" && Array.isArray(c.albums));

export const fichaDeDisco = (id: number) =>
  ficha<FichaDeDisco>(`/api/catalog/albums/${id}/`, (c) => typeof c.name === "string" && Array.isArray(c.songs));

export const fichaDeCancion = (id: number) =>
  ficha<FichaDeCancion>(`/api/catalog/songs/${id}/`, (c) => typeof c.title === "string" && typeof c.artist === "object" && Array.isArray(c.played_on));

export async function filtrosDelArchivo(): Promise<Filtros | null> {
  const respuesta = await pedir("/api/catalog/filters/");
  const c = respuesta.estado === "ok" ? (respuesta.cuerpo as Filtros) : null;
  return c && Array.isArray(c.decades) && Array.isArray(c.genres) ? c : null;
}

/** La búsqueda general, desde el navegador y mientras se escribe: sin caché y cancelable. Lanza si la API falla. */
export async function buscarEnElArchivo(q: string, opciones: { limite?: number; senial?: AbortSignal } = {}): Promise<Busqueda> {
  const respuesta = await fetch(`${base()}/api/catalog/search/${consulta({ q, limit: opciones.limite })}`, { cache: "no-store", signal: opciones.senial });
  if (!respuesta.ok) throw new Error(`La búsqueda respondió ${respuesta.status}`);
  return (await respuesta.json()) as Busqueda;
}
