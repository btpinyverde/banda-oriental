import type { Partida } from "../juego/historial";
import { claseCelda } from "../juego/logica";
import type { Feedback } from "../juego/tipos";

/**
 * Datos de la imagen para compartir en una story. Viajan en el link de la imagen (ver `urlDeStory`), así que se
 * validan con cuidado al leerlos: la versión oculta no lleva ningún texto libre, solo la cuadrícula y números.
 */
export interface CancionStory {
  titulo: string;
  artista: string;
  disco: string;
  anio?: number;
  /** Usuario de Instagram del artista, sin "@". */
  instagram?: string;
}

export interface DatosStory {
  /** Una fila por intento, con cuatro letras: a acierto, c cerca, e error, d sin datos. */
  filas: string[];
  /** En cuántos intentos salió, o `null` si no salió. */
  intentos: number | null;
  numero?: number;
  dia?: string;
  /** Solo en la versión "revelada": la canción del día. */
  cancion?: CancionStory;
}

const LETRA = { acierto: "a", cerca: "c", error: "e", desconocido: "d" } as const;
const FILA_VALIDA = /^[acde]{4}$/;
const INSTAGRAM_VALIDO = /^[A-Za-z0-9._]{1,30}$/;
const MAXIMO_TEXTO = 60;
const MAXIMO_NUMERO = 99999;
const INTENTOS_MAXIMOS = 6;
/** Subir este número cuando cambie el diseño de la imagen: las imágenes se guardan en caché sin vencimiento. */
const VERSION_DISENO = 3;

/** Los colores de cada intento como texto: una fila de cuatro letras por intento, separadas por punto. */
export function codificarCuadricula(feedback: Feedback[]): string {
  return feedback
    .map(
      (intento) =>
        LETRA[claseCelda("year", intento.year)] +
        LETRA[claseCelda("genre", intento.genre)] +
        LETRA[claseCelda("artist", intento.artist)] +
        LETRA[claseCelda("album", intento.album)],
    )
    .join(".");
}

/** Texto libre acotado: sin caracteres de control y de largo limitado. */
const limpiar = (texto: string | null) =>
  (texto ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, MAXIMO_TEXTO);

function leerCancion(parametros: URLSearchParams): CancionStory | undefined {
  const titulo = limpiar(parametros.get("t"));
  const artista = limpiar(parametros.get("a"));
  if (!titulo || !artista) return undefined;

  const anio = Number(parametros.get("y"));
  const instagram = parametros.get("ig") ?? "";
  return {
    titulo,
    artista,
    disco: limpiar(parametros.get("b")),
    ...(Number.isInteger(anio) && anio >= 1900 && anio <= 2100 && { anio }),
    ...(INSTAGRAM_VALIDO.test(instagram) && { instagram }),
  };
}

/** Lee y valida los datos de un link de imagen. Devuelve `null` si no sirven. */
export function leerParametros(parametros: URLSearchParams): DatosStory | null {
  const filas = (parametros.get("g") ?? "").split(".");
  if (filas.length < 1 || filas.length > INTENTOS_MAXIMOS || !filas.every((fila) => FILA_VALIDA.test(fila))) return null;

  const crudo = parametros.get("i");
  const intentos = crudo === "x" ? null : Number(crudo);
  if (intentos !== null && !(Number.isInteger(intentos) && intentos >= 1 && intentos <= INTENTOS_MAXIMOS)) return null;

  const numero = Number(parametros.get("n"));
  const dia = parametros.get("d") ?? "";
  const cancion = leerCancion(parametros);

  return {
    filas,
    intentos,
    ...(Number.isInteger(numero) && numero >= 1 && numero <= MAXIMO_NUMERO && { numero }),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(dia) && { dia }),
    ...(cancion && { cancion }),
  };
}

/** El link (relativo al sitio) de la imagen de story con estos datos. */
export function urlDeStory(datos: DatosStory): string {
  const parametros = new URLSearchParams();
  parametros.set("v", String(VERSION_DISENO));
  parametros.set("g", datos.filas.join("."));
  parametros.set("i", datos.intentos === null ? "x" : String(datos.intentos));
  if (datos.numero !== undefined) parametros.set("n", String(datos.numero));
  if (datos.dia) parametros.set("d", datos.dia);
  if (datos.cancion) {
    parametros.set("t", datos.cancion.titulo);
    parametros.set("a", datos.cancion.artista);
    if (datos.cancion.disco) parametros.set("b", datos.cancion.disco);
    if (datos.cancion.anio !== undefined) parametros.set("y", String(datos.cancion.anio));
    if (datos.cancion.instagram) parametros.set("ig", datos.cancion.instagram);
  }
  return `/compartir/story?${parametros.toString()}`;
}

/**
 * Los datos de la imagen de una partida guardada en el dispositivo. `undefined` si no se guardaron los colores de
 * los intentos (por ejemplo, un día que se volvió a abrir ya terminado): no hay con qué dibujar la cuadrícula.
 */
export function datosDePartida(partida: Partida, revelar: boolean): DatosStory | undefined {
  if (!partida.feedback || partida.feedback.length === 0) return undefined;
  return {
    filas: codificarCuadricula(partida.feedback).split("."),
    intentos: partida.ganada ? (partida.intentos ?? partida.feedback.length) : null,
    dia: partida.dia,
    ...(partida.numero !== undefined && { numero: partida.numero }),
    ...(revelar && {
      cancion: { titulo: partida.cancion.title, artista: partida.cancion.artist, disco: partida.cancion.album },
    }),
  };
}

/** La canción solo se muestra cuando el día ya pasó: si no, se estaría "quemando" para quien todavía no jugó. */
export function puedeRevelar(dia: string, hoy: string): boolean {
  return dia < hoy;
}

/** El texto que acompaña a la imagen: número del juego, resultado y link. */
export function textoParaCompartir(datos: { numero?: number; intentos: number | null }, url: string): string {
  const titulo = datos.numero === undefined ? "Banda Oriental" : `Banda Oriental #${datos.numero}`;
  return `${titulo} · ${datos.intentos ?? "X"}/${INTENTOS_MAXIMOS}\n${url}`;
}
