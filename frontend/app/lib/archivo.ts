/**
 * El archivo público: los días que ya vencieron, con su canción revelada. Se lee en el servidor (la página tiene que
 * llegar con el contenido en el HTML para que los buscadores y las vistas previas de los links lo vean) y se deja en
 * caché diez minutos (poco: si la API no respondía justo cuando se armó la página, el aviso de error no se queda mucho). Si la API no responde se devuelve `null` y la página lo explica en vez de romper.
 */

export interface DiaDelArchivo {
  date: string;
  song_title: string;
  artist: string;
}

export interface DetalleDelDia extends DiaDelArchivo {
  album: string;
  /** Usuario de Instagram del artista, si se cargó. */
  artist_instagram_handle: string;
}

const base = () => (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
const DIEZ_MINUTOS = 600;
// El servidor gratuito se duerme y puede tardar casi un minuto en despertar. Al armar la página (también cuando se arma el
// sitio) no se espera tanto: pasado este tiempo se sigue sin los datos y la página avisa, y se renueva sola.
const ESPERA_MAXIMA_MS = 20_000;

/** Una fecha con forma de día real (2026-10-03). Evita mandar a la API cualquier cosa que venga en la dirección. */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const parsada = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(parsada.getTime()) && parsada.toISOString().slice(0, 10) === fecha;
}

async function pedirAlArchivo(ruta: string): Promise<Response | null> {
  try {
    return await fetch(`${base()}${ruta}`, { next: { revalidate: DIEZ_MINUTOS }, signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  } catch {
    return null;
  }
}

/** Todos los días vencidos, del más nuevo al más viejo; `null` si no se pudo consultar. */
export async function obtenerDias(): Promise<DiaDelArchivo[] | null> {
  const respuesta = await pedirAlArchivo("/api/archive/");
  if (!respuesta?.ok) return null;
  try {
    return (await respuesta.json()).days as DiaDelArchivo[];
  } catch {
    return null;
  }
}

/** Un día vencido; `"no-encontrado"` si no existe (o todavía no venció) y `null` si no se pudo consultar. */
export async function obtenerDia(fecha: string): Promise<DetalleDelDia | "no-encontrado" | null> {
  if (!esFechaValida(fecha)) return "no-encontrado";
  const respuesta = await pedirAlArchivo(`/api/archive/${fecha}/`);
  if (!respuesta) return null;
  if (respuesta.status === 404) return "no-encontrado";
  if (!respuesta.ok) return null;
  try {
    return (await respuesta.json()) as DetalleDelDia;
  } catch {
    return null;
  }
}
