import { describe, expect, it } from "vitest";
import { OPCIONES, RESPUESTA, evaluar, pistasDesbloqueadas } from "./practica";

const opcion = (id: number) => OPCIONES.find((o) => o.id === id)!;

describe("evaluar (solo para la práctica: el juego real lo calcula el servidor)", () => {
  it("la respuesta es la única que acierta todo", () => {
    expect(evaluar(RESPUESTA)).toEqual({ year: "exact", genre: "same", artist: "same", album: "same" });
  });

  it("otra canción del mismo disco coincide en casi todo pero no es la respuesta", () => {
    const hermana = OPCIONES.find((o) => o.album === RESPUESTA.album && o.id !== RESPUESTA.id)!;

    expect(evaluar(hermana)).toEqual({ year: "exact", genre: "same", artist: "same", album: "same" });
    expect(hermana.id).not.toBe(RESPUESTA.id);
  });

  it("el año dice hacia dónde está el correcto", () => {
    const anterior = OPCIONES.find((o) => o.year! < RESPUESTA.year!)!;
    const posterior = OPCIONES.find((o) => o.year! > RESPUESTA.year!)!;

    expect(evaluar(anterior).year).toBe("newer");
    expect(evaluar(posterior).year).toBe("older");
  });

  it("mismo artista en otro disco: artista acierta y disco no", () => {
    const otroDisco = OPCIONES.find((o) => o.artist === RESPUESTA.artist && o.album !== RESPUESTA.album)!;

    expect(evaluar(otroDisco)).toMatchObject({ artist: "same", album: "different" });
  });

  it("hay ejemplos que muestran los tres colores: acierto, cerca (año) y error", () => {
    const todos = OPCIONES.map(evaluar);

    expect(todos.some((f) => f.genre === "different" && f.artist === "different")).toBe(true);
    expect(todos.some((f) => f.year === "newer" || f.year === "older")).toBe(true);
    expect(todos.some((f) => f.artist === "same")).toBe(true);
  });

  it("las opciones incluyen la respuesta, tienen ids distintos y son de mentira (no se parecen a canciones reales)", () => {
    expect(OPCIONES).toContain(RESPUESTA);
    expect(new Set(OPCIONES.map((o) => o.id)).size).toBe(OPCIONES.length);
    expect(OPCIONES.length).toBeGreaterThanOrEqual(4);
  });
});

describe("pistasDesbloqueadas", () => {
  it("cada error abre una pista más, en el orden del juego: batería, bajo, otros, voz", () => {
    expect(pistasDesbloqueadas(1).map((s) => s.stem_type)).toEqual(["drums"]);
    expect(pistasDesbloqueadas(3).map((s) => s.stem_type)).toEqual(["drums", "bass", "other"]);
    expect(pistasDesbloqueadas(4).map((s) => s.stem_type)).toEqual(["drums", "bass", "other", "vocals"]);
  });

  it("nunca pasa de cuatro", () => {
    expect(pistasDesbloqueadas(9)).toHaveLength(4);
  });
});
