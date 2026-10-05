import { idDeDispositivo } from "../juego/dispositivo";
import { comoJson, pedir } from "../juego/http";
import { pedirConPase } from "../humano/pedir-con-pase";
import { leerSesion } from "../cuenta/sesion";

export interface JugadorSala {
  /** Solo para quien organiza: sirve para aceptar, rechazar o sacar. */
  id?: number;
  name: string;
  /** El equipo (su id) si la sala juega por equipos; `null` si todavía no tiene. */
  team?: number | null;
  /** Solo para quien organiza: si ya respondió en la ronda en curso. */
  answered?: boolean;
}

export interface Equipo {
  id: number;
  name: string;
  color: string;
}

/** La posición de un equipo: su puntaje es el promedio de los puntos de sus integrantes. */
export interface FilaEquipo {
  position: number;
  id: number;
  name: string;
  color: string;
  members: number;
  /** El promedio de puntos por integrante (con eso se ordena). */
  points: number;
  total: number;
  correct: number;
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

/** Cómo se acotan las canciones que salen al azar: lo que se incluye y lo que se excluye (todo opcional). */
export interface FiltrosAzar {
  include: {
    year_from?: number;
    year_to?: number;
    genres?: string[];
    artists?: number[];
    release_types?: string[];
    duration_min?: number;
    duration_max?: number;
  };
  exclude: { genres?: string[]; artists?: number[]; release_types?: string[]; years?: [number, number][]; songs?: number[] };
}

/** Una canción de la lista que arma quien organiza: se oye con el preview de Deezer o con un video de YouTube. */
export interface ItemDeLista {
  song_id: number;
  source: "deezer" | "youtube";
  youtube_id?: string;
  start_seconds?: number;
}

export interface LecturaDeYoutube {
  youtube_id: string;
  title: string;
  author: string;
  suggestions: CancionResuelta[];
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
  round: {
    index: number;
    starts_at: string;
    ends_at: string;
    /** El audio de Deezer; en una ronda de YouTube, el de reserva por si el video no se puede reproducir. */
    preview_url?: string | null;
    source?: "deezer" | "youtube";
    youtube_id?: string;
    start_seconds?: number;
    answered?: boolean;
  } | null;
  /** Cuántos jugadores hacen falta para empezar (lo decide el servidor: 1 mientras se prueba el modo, 2 al abrirlo a todos). */
  min_players?: number;
  /** Dónde suena la música: en cada dispositivo o solo en el de quien organiza (el anfitrión). */
  audio_mode?: "each" | "host";
  /** Quién puede entrar: cualquiera con el enlace o solo quienes acepte quien organiza. */
  join_mode?: "open" | "approval";
  /** Solo para jugadores: si ya está aceptado, si espera o si no lo aceptaron. */
  my_status?: "accepted" | "pending" | "rejected";
  team_mode?: "none" | "random" | "manual";
  teams?: Equipo[];
  /** Solo para jugadores: el equipo (id) en el que está. */
  my_team?: number | null;
  team_ranking?: FilaEquipo[];
  /** Solo para quien organiza, en el lobby: quiénes esperan que los acepte. */
  pending?: { id: number; name: string }[];
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
  join_mode?: "open" | "approval";
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
    crear: async (
      opciones: {
        rondas?: number;
        segundos?: number;
        titulo?: string;
        audioMode?: "each" | "host";
        joinMode?: "open" | "approval";
        modoDeCanciones?: "random" | "list";
        filtros?: FiltrosAzar;
        lista?: ItemDeLista[];
        teamMode?: "none" | "random" | "manual";
        teamCount?: number;
        teamNames?: string[];
      } = {},
    ): Promise<SalaCreada> => {
      const cuerpo = {
        ...(opciones.rondas !== undefined && { round_count: opciones.rondas }),
        ...(opciones.segundos !== undefined && { round_seconds: opciones.segundos }),
        ...(opciones.titulo?.trim() && { title: opciones.titulo.trim() }),
        ...(opciones.audioMode && { audio_mode: opciones.audioMode }),
        ...(opciones.joinMode && { join_mode: opciones.joinMode }),
        ...(opciones.modoDeCanciones && { songs_mode: opciones.modoDeCanciones }),
        ...(opciones.filtros && { filters: opciones.filtros }),
        ...(opciones.lista && { playlist: opciones.lista }),
        ...(opciones.teamMode && opciones.teamMode !== "none" && { team_mode: opciones.teamMode, team_count: opciones.teamCount, team_names: opciones.teamNames }),
      };
      return comoJson(await enviar("/api/battles/", cuerpo, undefined, true));
    },

    unirse: async (code: string, nombre: string, hostToken?: string): Promise<{ player: { name: string; status?: string } }> =>
      // Sin comprobación humana: un bar entero entra desde la misma dirección y el pase se entrega con tope por dirección.
    comoJson(await enviar(ruta(code, "join/"), { display_name: nombre }, hostToken)),

    /** Quien organiza pone a una persona en un equipo (o la saca con `null`). Solo en salas con equipos armados a mano. */
    asignarEquipo: async (code: string, playerId: number, teamId: number | null, hostToken?: string): Promise<{ ok: boolean }> =>
      comoJson(await enviar(ruta(code, "team/"), { player_id: playerId, team_id: teamId }, hostToken)),

    /** Cuántas canciones tiene un segmento, para ver si alcanza antes de crear la sala. */
    pool: async (filtros: FiltrosAzar): Promise<number> =>
      (await comoJson<{ count: number }>(await pedir("/api/battles/pool/", { method: "POST", headers: cabeceras(undefined, true), body: JSON.stringify({ filters: filtros }) }))).count,

    /** Lee un enlace de YouTube: el video, su título y las canciones del catálogo que podría ser. */
    youtube: async (url: string): Promise<LecturaDeYoutube> =>
      comoJson(await pedir("/api/battles/youtube/", { method: "POST", headers: cabeceras(undefined, true), body: JSON.stringify({ url }) })),

    /** Quien organiza acepta o rechaza a alguien en el lobby (rechazar a quien ya entró lo saca). */
    revisar: async (code: string, playerId: number, aceptar: boolean, hostToken?: string): Promise<{ ok: boolean }> =>
      comoJson(await enviar(ruta(code, "review/"), { player_id: playerId, accept: aceptar }, hostToken)),

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
