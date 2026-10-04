import type { EjeFeedback, Feedback, StemInfo, TipoStem } from "./tipos";

export type ClaseCelda = "acierto" | "cerca" | "error" | "desconocido";

/** Color de una celda de la tabla de intentos según lo que respondió el backend. */
export function claseCelda<E extends EjeFeedback>(eje: E, valor: Feedback[E]): ClaseCelda {
  if (valor === "unknown") return "desconocido";
  if (eje === "year") return valor === "exact" ? "acierto" : "cerca";
  return valor === "same" ? "acierto" : "error";
}

/** Flecha del año: apunta hacia donde está el año correcto respecto del que se adivinó. */
export function flechaAnio(valor: Feedback["year"]): string {
  if (valor === "newer") return "↑";
  if (valor === "older") return "↓";
  return "";
}

// Lugar fijo de cada pista en pantalla, como en el diseño: no depende del orden en que el backend las desbloquea.
const ORDEN_EN_PANTALLA: TipoStem[] = ["drums", "bass", "vocals", "other"];
const ETIQUETAS: Record<TipoStem, string> = { drums: "Batería", bass: "Bajo", other: "Otros", vocals: "Voz" };

// Orden en que el backend suele desbloquear las pistas; se usa mientras una pista todavía no llegó.
const PISTA_HABITUAL: Record<TipoStem, number> = { drums: 1, bass: 2, vocals: 3, other: 4 };

export interface EtapaStem {
  tipo: TipoStem;
  etiqueta: string;
  desbloqueada: boolean;
  /** Número de pista ("Pista 3"): el que dice el backend si ya llegó; si no, el habitual. */
  pista: number;
}

/** Las cuatro pistas del día, siempre en el mismo lugar; cada una abierta o bloqueada según lo que llegó. */
export function etapasDeStems(desbloqueadas: StemInfo[]): EtapaStem[] {
  const recibidas = new Map(desbloqueadas.map((s) => [s.stem_type, s.unlock_order]));
  return ORDEN_EN_PANTALLA.map((tipo) => ({
    tipo,
    etiqueta: ETIQUETAS[tipo],
    desbloqueada: recibidas.has(tipo),
    pista: recibidas.get(tipo) ?? PISTA_HABITUAL[tipo],
  }));
}

/** La pista que se reproduce: la última desbloqueada, porque el backend sube mezclas acumulativas. */
export function stemActual(desbloqueadas: StemInfo[]): StemInfo | undefined {
  return [...desbloqueadas].sort((a, b) => b.unlock_order - a.unlock_order)[0];
}

const ZONA = "America/Montevideo";

/** Segundos que faltan para la medianoche de Montevideo, que es cuando cambia la canción. */
export function segundosHastaMedianoche(ahora: Date): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const transcurridos = valor("hour") * 3600 + valor("minute") * 60 + valor("second");
  return 86400 - transcurridos;
}

/** La fecha de hoy en Montevideo ("2026-10-03"): es el día de la canción, que cambia a la medianoche de allá. */
export function diaDeMontevideo(ahora: Date): string {
  // El formato sueco (sv-SE) escribe la fecha como año-mes-día.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA }).format(ahora);
}

export function formatoCuentaAtras(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(Math.floor(total / 3600))}:${dos(Math.floor((total % 3600) / 60))}:${dos(total % 60)}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "#138" si el backend manda el número del juego; si no, la fecha corta ("3 oct"). */
export function etiquetaDelDia({ day, number }: { day: string; number?: number }): string {
  if (number !== undefined) return `#${number}`;
  const [, mes, dia] = day.split("-").map(Number);
  return `${dia} ${MESES[mes - 1]}`;
}

/** Minúsculas, sin tildes ni signos y con un solo espacio entre palabras: para buscar y comparar textos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const LARGO_MAXIMO_NOMBRE = 50;

/** Nombre para el ranking: sin espacios en los bordes, de 1 a 50 caracteres. `null` si no sirve. */
export function nombreValido(nombre: string): string | null {
  const limpio = nombre.trim();
  return limpio.length >= 1 && limpio.length <= LARGO_MAXIMO_NOMBRE ? limpio : null;
}
