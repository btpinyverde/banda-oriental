import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarIntento, leerIntentos, leerSegundos, sumarSegundos } from "./almacen";
import type { CancionCatalogo } from "./tipos";

const cancion = (id: number, title: string): CancionCatalogo => ({
  id,
  title,
  artist: "Artista",
  album: "Disco",
  year: 2000 + id,
  genre: "Rock",
});

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("intentos guardados", () => {
  it("devuelve lo que se guardó para ese día, por número de intento", () => {
    guardarIntento("2026-10-03", 1, cancion(1, "Uno"));
    guardarIntento("2026-10-03", 2, cancion(2, "Dos"));

    expect(leerIntentos("2026-10-03")).toEqual({ 1: cancion(1, "Uno"), 2: cancion(2, "Dos") });
  });

  it("no mezcla días: un día sin datos devuelve vacío", () => {
    guardarIntento("2026-10-03", 1, cancion(1, "Uno"));

    expect(leerIntentos("2026-10-04")).toEqual({});
  });

  it("al guardar un día nuevo borra los de días anteriores para no acumular", () => {
    guardarIntento("2026-10-03", 1, cancion(1, "Uno"));
    guardarIntento("2026-10-04", 1, cancion(2, "Dos"));

    expect(window.localStorage.getItem("banda-oriental:juego:2026-10-03")).toBeNull();
    expect(leerIntentos("2026-10-04")).toEqual({ 1: cancion(2, "Dos") });
  });

  it("ignora un contenido corrupto en vez de romper", () => {
    window.localStorage.setItem("banda-oriental:juego:2026-10-03", "{no es json");

    expect(leerIntentos("2026-10-03")).toEqual({});
  });
});

describe("segundos jugados", () => {
  it("suma los segundos de cada intento del día", () => {
    sumarSegundos("2026-10-03", 12.5);
    sumarSegundos("2026-10-03", 7.5);

    expect(leerSegundos("2026-10-03")).toBe(20);
  });

  it("arranca en cero y conserva los intentos al sumar", () => {
    expect(leerSegundos("2026-10-03")).toBe(0);

    guardarIntento("2026-10-03", 1, cancion(1, "Uno"));
    sumarSegundos("2026-10-03", 3);

    expect(leerIntentos("2026-10-03")).toEqual({ 1: cancion(1, "Uno") });
  });
});

describe("si el navegador bloquea el almacenamiento", () => {
  it("no rompe: lee vacío y guarda sin efecto", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(() => guardarIntento("2026-10-03", 1, cancion(1, "Uno"))).not.toThrow();
    expect(leerIntentos("2026-10-03")).toEqual({});
    expect(leerSegundos("2026-10-03")).toBe(0);
  });
});
