/**
 * Tipos del juego diario. Los nombres en inglés con guion bajo son los del JSON del backend
 * (`/api/daily/`, `/api/daily/guess/`, `/api/daily/score/`). Ver docs/contrato-api-jugar.md para lo que
 * el frontend espera del backend y todavía no existe.
 */

export type TipoStem = "drums" | "bass" | "other" | "vocals";

export interface StemInfo {
  stem_type: TipoStem;
  unlock_order: number;
  url: string;
}

export type EjeFeedback = "year" | "genre" | "artist" | "album";

export interface Feedback {
  year: "exact" | "older" | "newer" | "unknown";
  genre: "same" | "different" | "unknown";
  artist: "same" | "different" | "unknown";
  album: "same" | "different" | "unknown";
}

/** Una canción del catálogo, con los datos que la tabla de intentos necesita mostrar. */
export interface CancionCatalogo {
  id: number;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string;
}

export interface IntentoHistorial {
  attempt_number: number;
  feedback: Feedback;
  /** Título de lo que se adivinó. */
  guessed_text?: string;
  /** La canción adivinada completa: con eso cualquier dispositivo de la cuenta dibuja la fila. `null` en intentos viejos. */
  guessed_song?: CancionCatalogo | null;
}

export interface EstadoEnCurso {
  finished: false;
  day: string;
  /** Número del juego (#138). Opcional hasta que el backend lo mande. */
  number?: number;
  attempt_number: number;
  attempts_remaining: number;
  unlocked_stems: StemInfo[];
  feedback_history: IntentoHistorial[];
}

export interface EstadoTerminado {
  finished: true;
  day: string;
  number?: number;
  won: boolean;
  score_submitted: boolean;
  song: { title: string; artist: string; album: string };
  score?: number;
  winning_attempt?: number;
}

export type EstadoDelDia = EstadoEnCurso | EstadoTerminado;

export interface ResultadoIntento {
  is_correct: boolean;
  attempt_number: number;
  feedback: Feedback;
  finished: boolean;
  attempts_remaining: number;
}

export interface ResultadoPuntaje {
  score: number;
  winning_attempt: number;
  display_name: string;
}

export class ApiError extends Error {
  status: number;
  /** Código de la API para casos que la pantalla trata distinto (por ejemplo `email_not_confirmed`). */
  codigo?: string;

  constructor(message: string, status: number, codigo?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.codigo = codigo;
  }
}

/** Todo lo que el juego necesita del backend. Hay una versión real (HTTP) y una de demostración. */
export interface ClienteJuego {
  /** `null` cuando todavía no hay una canción publicada para hoy. */
  estadoDelDia(idDispositivo: string): Promise<EstadoDelDia | null>;
  enviarIntento(idDispositivo: string, numeroDeIntento: number, idCancion: number): Promise<ResultadoIntento>;
  enviarPuntaje(idDispositivo: string, nombre: string, segundosTotales: number): Promise<ResultadoPuntaje>;
  listarCanciones(): Promise<CancionCatalogo[]>;
}
