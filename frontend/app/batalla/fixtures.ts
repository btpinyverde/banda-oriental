import type { EstadoSala, SalaUnible } from "../lib/batallas/api-batallas";

/** Estados de sala para las pruebas de las pantallas de la batalla. */
export const T0 = Date.parse("2026-10-05T20:00:00Z");
export const iso = (segundos: number) => new Date(T0 + segundos * 1000).toISOString();

export const sala = (cambios: Partial<EstadoSala> = {}): EstadoSala => ({
  changed: true,
  server_time: iso(0),
  key: "1.lobby0",
  code: "ABC234",
  title: "",
  role: "player",
  status: "lobby",
  round_count: 3,
  round_seconds: 10,
  phase: { name: "lobby", index: 0 },
  round: null,
  players: [{ name: "Ana" }, { name: "Beto" }],
  ...cambios,
});

export const unible = (): SalaUnible => ({ joinable: true, server_time: iso(0), code: "ABC234", title: "Cumple", round_count: 5, round_seconds: 20, players_count: 2 });

export const enRonda = (cambios: Partial<EstadoSala> = {}) =>
  sala({
    status: "playing",
    phase: { name: "playing", index: 0 },
    round: { index: 0, starts_at: iso(5), ends_at: iso(15), preview_url: "https://cdn/x.mp3", answered: false },
    ...cambios,
  });

export const enRevelacion = (cambios: Partial<EstadoSala> = {}) =>
  sala({
    status: "playing",
    phase: { name: "reveal", index: 0 },
    round: { index: 1, starts_at: iso(21), ends_at: iso(31), preview_url: "https://cdn/y.mp3", answered: false },
    reveal: {
      song: { id: 7, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "Rock" },
      my_answer: { correct: true, points: 130, guessed: "Zafar" },
    },
    ranking: [
      { position: 1, name: "Ana", points: 130, correct: 1 },
      { position: 2, name: "Beto", points: 0, correct: 0 },
    ],
    ...cambios,
  });

export const terminada = (cambios: Partial<EstadoSala> = {}) =>
  enRevelacion({ status: "finished", phase: { name: "finished", index: 2 }, round: null, ...cambios });
