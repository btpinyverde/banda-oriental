import { beforeEach, describe, expect, it, vi } from "vitest";
import { leerHistorial } from "../juego/almacen-historial";
import { ApiError } from "../juego/tipos";
import type { ApiCuenta, DiaDeCuenta } from "./api-cuenta";
import { guardarSesion, leerSesion } from "./sesion";
import { partidaDeCuenta, sincronizarHistorial } from "./sincronizar";

const feedback = { year: "exact", genre: "same", artist: "same", album: "same" };
const dia = (extra: Partial<DiaDeCuenta> = {}): DiaDeCuenta => ({
  day: "2026-10-03",
  finished: true,
  won: true,
  winning_attempt: 2,
  score: 150,
  attempts: [
    { attempt_number: 1, guessed_text: "x", is_correct: false, feedback: { ...feedback, year: "older" } },
    { attempt_number: 2, guessed_text: "A las nueve", is_correct: true, feedback },
  ],
  song: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo", year: 2004 },
  ...extra,
});

beforeEach(() => window.localStorage.clear());

describe("partidaDeCuenta", () => {
  it("convierte un día ganado a la partida que se guarda en el dispositivo", () => {
    expect(partidaDeCuenta(dia())).toEqual({
      dia: "2026-10-03",
      ganada: true,
      intentos: 2,
      cancion: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
      feedback: [{ ...feedback, year: "older" }, feedback],
      puntaje: 150,
    });
  });

  it("un día perdido no tiene cantidad de intentos ni puntaje", () => {
    const partida = partidaDeCuenta(dia({ won: false, winning_attempt: null, score: null }));

    expect(partida).toMatchObject({ ganada: false, intentos: null });
    expect(partida).not.toHaveProperty("puntaje");
  });

  it("ignora los días que todavía no terminaron (no se conoce la canción)", () => {
    expect(partidaDeCuenta(dia({ finished: false, song: null }))).toBeNull();
  });
});

describe("sincronizarHistorial", () => {
  const apiCon = (historial: ApiCuenta["historial"]) => ({ historial }) as unknown as ApiCuenta;

  it("suma al historial del dispositivo los días terminados de la cuenta", async () => {
    const api = apiCon(vi.fn().mockResolvedValue([dia(), dia({ day: "2026-10-04", finished: false, song: null })]));

    await sincronizarHistorial(api, "tok");

    expect(leerHistorial().map((p) => p.dia)).toEqual(["2026-10-03"]);
  });

  it("no pisa lo que el dispositivo ya sabía de un día", async () => {
    window.localStorage.setItem(
      "banda-oriental:historial",
      JSON.stringify([{ dia: "2026-10-03", ganada: true, intentos: 2, cancion: { title: "A las nueve", artist: "NTVG", album: "ECML" }, puntaje: 999 }]),
    );

    await sincronizarHistorial(apiCon(vi.fn().mockResolvedValue([dia()])), "tok");

    expect(leerHistorial()[0].puntaje).toBe(999);
  });

  it("si la API dice 401 cierra la sesión del dispositivo", async () => {
    guardarSesion({ token: "vencido", email: "ana@example.com" });
    const api = apiCon(vi.fn().mockRejectedValue(new ApiError("Token inválido.", 401)));

    await sincronizarHistorial(api, "vencido");

    expect(leerSesion()).toBeNull();
  });

  it("si falla por otra cosa (sin conexión) no rompe ni cierra la sesión", async () => {
    guardarSesion({ token: "tok", email: "ana@example.com" });
    const api = apiCon(vi.fn().mockRejectedValue(new ApiError("No se pudo conectar con el servidor.", 0)));

    await expect(sincronizarHistorial(api, "tok")).resolves.toBeUndefined();

    expect(leerSesion()).not.toBeNull();
  });
});
