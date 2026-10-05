import type { PeriodoRanking, RankingServidor } from "../juego/tipos";

/**
 * Datos de la imagen para presumir el puesto en un ranking. Viajan en el link de la imagen (ver `urlDePosicion`), así
 * que se validan con cuidado al leerlos: nada de texto libre largo ni caracteres de control.
 */
export interface DatosPosicion {
  periodo: PeriodoRanking;
  puesto: number;
  puntos: number;
  partidas: number;
  /** Cuántos jugadores tiene ese ranking en total; falta si el servidor todavía no lo manda. */
  jugadores?: number;
  /** El nombre público con el que se aparece. */
  nombre?: string;
}

const PERIODOS: PeriodoRanking[] = ["day", "week", "month", "all"];
const MAXIMO_PUESTO = 9_999_999;
const MAXIMO_PUNTOS = 100_000_000;
const MAXIMO_PARTIDAS = 99_999;
const MAXIMO_NOMBRE = 30;
/** Subir este número cuando cambie el diseño de la imagen: las imágenes se guardan en caché sin vencimiento. */
const VERSION_DISENO = 1;

/** Cómo se nombra cada escala dentro de una frase: "en el ranking de hoy". */
export const ESCALA: Record<PeriodoRanking, string> = {
  day: "hoy",
  week: "esta semana",
  month: "este mes",
  all: "de siempre",
};

const limpiar = (texto: string | null) =>
  (texto ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAXIMO_NOMBRE);

const entero = (crudo: string | null, minimo: number, maximo: number): number | null => {
  if (crudo === null || !/^\d+$/.test(crudo)) return null;
  const valor = Number(crudo);
  return valor >= minimo && valor <= maximo ? valor : null;
};

/** Lee y valida los datos de un link de imagen. Devuelve `null` si no sirven. */
export function leerParametrosPosicion(parametros: URLSearchParams): DatosPosicion | null {
  const periodo = parametros.get("p") as PeriodoRanking | null;
  if (!periodo || !PERIODOS.includes(periodo)) return null;
  const puesto = entero(parametros.get("r"), 1, MAXIMO_PUESTO);
  const puntos = entero(parametros.get("s"), 0, MAXIMO_PUNTOS);
  const partidas = entero(parametros.get("g"), 1, MAXIMO_PARTIDAS);
  if (puesto === null || puntos === null || partidas === null) return null;
  const jugadores = parametros.has("j") ? entero(parametros.get("j"), 1, MAXIMO_PUESTO) : undefined;
  if (jugadores === null || (jugadores !== undefined && puesto > jugadores)) return null;
  const nombre = limpiar(parametros.get("n"));
  return { periodo, puesto, puntos, partidas, ...(jugadores !== undefined && { jugadores }), ...(nombre && { nombre }) };
}

/** El link (relativo al sitio) de la imagen de la posición con estos datos. */
export function urlDePosicion(datos: DatosPosicion): string {
  const parametros = new URLSearchParams();
  parametros.set("v", String(VERSION_DISENO));
  parametros.set("p", datos.periodo);
  parametros.set("r", String(datos.puesto));
  parametros.set("s", String(datos.puntos));
  parametros.set("g", String(datos.partidas));
  if (datos.jugadores !== undefined) parametros.set("j", String(datos.jugadores));
  if (datos.nombre) parametros.set("n", datos.nombre);
  return `/compartir/posicion?${parametros.toString()}`;
}

/** Los datos para compartir el puesto propio en el ranking que se está mirando; `null` si no se tiene puesto. */
export function datosDePosicion(ranking: RankingServidor): DatosPosicion | null {
  if (!ranking.me) return null;
  const nombre = limpiar(ranking.me.display_name);
  return {
    periodo: ranking.period,
    puesto: ranking.me.rank,
    puntos: ranking.me.score,
    partidas: ranking.me.games,
    ...(ranking.players !== undefined && ranking.players >= ranking.me.rank && { jugadores: ranking.players }),
    ...(nombre && { nombre }),
  };
}

const puntos = (n: number) => new Intl.NumberFormat("es-UY").format(n);

/** El texto que acompaña a la imagen: puesto, escala, puntos y link. */
export function textoParaCompartirPosicion(datos: DatosPosicion, url: string): string {
  const donde = datos.periodo === "all" ? `en el ranking ${ESCALA.all}` : `en el ranking de ${ESCALA[datos.periodo]}`;
  const lugar =
    datos.puesto === 1
      ? `Soy el número 1 ${donde}`
      : `Estoy en el puesto ${datos.puesto}${datos.jugadores !== undefined ? ` de ${datos.jugadores}` : ""} ${donde}`;
  return `${lugar} de Banda Oriental, con ${puntos(datos.puntos)} puntos. ¿Me ganás?\n${url}`;
}

export const nombreDelArchivoPosicion = (datos: DatosPosicion) => `banda-oriental-ranking-${datos.periodo}-${datos.puesto}.png`;
