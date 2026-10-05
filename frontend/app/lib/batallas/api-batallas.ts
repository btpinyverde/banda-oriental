import { idDeDispositivo } from "../juego/dispositivo";
import { comoJson, pedir } from "../juego/http";
import { pedirConPase } from "../humano/pedir-con-pase";
import { leerSesion } from "../cuenta/sesion";

export interface JugadorSala {
  name: string;
  /** Solo para quien organiza: si ya respondió en la ronda en curso. */
  answered?: boolean;
}

export interface FilaRanking {
  position: number;
  name: string;
  points: number;
  correct: number;
}

export interface CancionResuelta {
  id: number;
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string;
}

export type NombreDeFase = "lobby" | "countdown" | "playing" | "reveal" | "finished";

/** El estado de la sala para quien participa (jugador u organizador). Contrato: docs/contrato-api-batallas.md. */
export interface EstadoSala {
  changed: true;
  server_time: string;
  key: string;
  code: string;
  title: string;
  role: "host" | "player";
  status: "lobby" | "playing" | "finished";
  round_count: number;
  round_seconds: number;
  phase: { name: NombreDeFase; index: number };
  round: { index: number; starts_at: string; ends_at: string; preview_url?: string | null; answered?: boolean } | null;
  players: JugadorSala[];
  reveal?: { song: CancionResuelta; my_answer: { correct: boolean; points: number; guessed: string | null } | null };
  ranking?: FilaRanking[];
}

export interface SinCambios {
  changed: false;
  server_time: string;
}

/** Lo único que ve quien todavía no entró a una sala que está en su lobby. */
export interface SalaUnible {
  joinable: true;
  server_time: string;
  code: string;
  title: string;
  round_count: number;
  round_seconds: number;
  players_count: number;
}

export interface SalaCreada {
  code: string;
  host_token: string;
  round_count: number;
  round_seconds: number;
  title: string;
}

export interface BatallaResumen {
  code: string;
  title: string;
  status: "lobby" | "playing" | "finished";
  created_at: string;
  players_count: number;
  role: "host" | "player";
  my_position: number | null;
}

const CLAVE_ORGANIZADOR = (code: string) => `banda-oriental:batalla-host:${code.toUpperCase()}`;

/** La clave con la que se organiza una sala se queda en este dispositivo (como la sesión: sin ella no se puede empezar). */
export function guardarHostToken(code: string, token: string): void {
  try {
    window.localStorage.setItem(CLAVE_ORGANIZADOR(code), token);
  } catch {
    // Almacenamiento bloqueado: la identidad del dispositivo organizador igual sirve mientras no se cambie de navegador.
  }
}

export function leerHostToken(code: string): string | null {
  try {
    return window.localStorage.getItem(CLAVE_ORGANIZADOR(code));
  } catch {
    return null;
  }
}

const cabeceras = (hostToken?: string, conCuerpo = false): Record<string, string> => {
  const sesion = leerSesion();
  return {
    "X-Device-Id": idDeDispositivo(),
    ...(conCuerpo && { "Content-Type": "application/json" }),
    ...(sesion && { Authorization: `Bearer ${sesion.token}` }),
    ...(hostToken && { "X-Host-Token": hostToken }),
  };
};

const ruta = (code: string, resto = "") => `/api/battles/${encodeURIComponent(code.toUpperCase())}/${resto}`;

/** Todo lo que el sitio le pide a la API de batallas. Contrato: docs/contrato-api-batallas.md. */
export function crearApiBatallas() {
  const enviar = (destino: string, cuerpo: unknown, hostToken?: string, conComprobacion = false) =>
    (conComprobacion ? pedirConPase : pedir)(destino, {
      method: "POST",
      headers: cabeceras(hostToken, true),
      body: JSON.stringify(cuerpo),
    });

  return {
    crear: async (opciones: { rondas?: number; segundos?: number; titulo?: string } = {}): Promise<SalaCreada> => {
      const cuerpo = {
        ...(opciones.rondas !== undefined && { round_count: opciones.rondas }),
        ...(opciones.segundos !== undefined && { round_seconds: opciones.segundos }),
        ...(opciones.titulo?.trim() && { title: opciones.titulo.trim() }),
      };
      return comoJson(await enviar("/api/battles/", cuerpo, undefined, true));
    },

    unirse: async (code: string, nombre: string, hostToken?: string): Promise<{ player: { name: string } }> =>
      comoJson(await enviar(ruta(code, "join/"), { display_name: nombre }, hostToken, true)),

    empezar: async (code: string, hostToken?: string): Promise<{ status: string }> =>
      comoJson(await enviar(ruta(code, "start/"), {}, hostToken, true)),

    estado: async (code: string, opciones: { since?: string; hostToken?: string } = {}): Promise<EstadoSala | SinCambios | SalaUnible> => {
      const consulta = opciones.since ? `?since=${encodeURIComponent(opciones.since)}` : "";
      return comoJson(await pedir(`${ruta(code)}${consulta}`, { headers: cabeceras(opciones.hostToken), cache: "no-store" }));
    },

    responder: async (code: string, songId: number): Promise<{ received: boolean }> =>
      comoJson(await enviar(ruta(code, "answer/"), { song_id: songId })),

    mias: async (): Promise<BatallaResumen[]> => {
      const datos = await comoJson<{ battles: BatallaResumen[] }>(
        await pedir("/api/battles/mine/", { headers: cabeceras(), cache: "no-store" }),
      );
      return datos.battles;
    },
  };
}

export type ApiBatallas = ReturnType<typeof crearApiBatallas>;
