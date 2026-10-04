import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENTO_HISTORIAL, guardarPartida, leerHistorial } from "./almacen-historial";
import type { Partida } from "./historial";

const CLAVE = "banda-oriental:historial";
const partida = (dia: string, extra: Partial<Partida> = {}): Partida => ({
  dia,
  ganada: true,
  intentos: 3,
  cancion: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
  ...extra,
});

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("historial en el dispositivo", () => {
  it("arranca vacío", () => {
    expect(leerHistorial()).toEqual([]);
  });

  it("guarda una partida y la devuelve en la lectura siguiente", () => {
    guardarPartida(partida("2026-10-03"));

    expect(leerHistorial()).toEqual([partida("2026-10-03")]);
  });

  it("conserva todo lo jugado: no se borra al guardar un día nuevo", () => {
    guardarPartida(partida("2026-10-01"));
    guardarPartida(partida("2026-10-02", { ganada: false, intentos: 6 }));
    guardarPartida(partida("2026-10-03"));

    expect(leerHistorial().map((p) => p.dia)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("guardar dos veces el mismo día no lo duplica", () => {
    guardarPartida(partida("2026-10-03"));
    guardarPartida(partida("2026-10-03"));

    expect(leerHistorial()).toHaveLength(1);
  });

  it("no se mezcla con los datos del día en curso que guarda el juego", () => {
    window.localStorage.setItem("banda-oriental:juego:2026-10-03", JSON.stringify({ intentos: {}, segundos: 0 }));

    guardarPartida(partida("2026-10-04"));

    expect(window.localStorage.getItem("banda-oriental:juego:2026-10-03")).not.toBeNull();
  });

  it("avisa a la pantalla, en la misma pestaña, cuando cambia el historial", () => {
    const alCambiar = vi.fn();
    window.addEventListener(EVENTO_HISTORIAL, alCambiar);

    guardarPartida(partida("2026-10-03"));

    expect(alCambiar).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_HISTORIAL, alCambiar);
  });
});

describe("datos dañados o bloqueados", () => {
  it("ignora un contenido que no es JSON", () => {
    window.localStorage.setItem(CLAVE, "{no es json");

    expect(leerHistorial()).toEqual([]);
  });

  it("ignora un contenido que no es una lista", () => {
    window.localStorage.setItem(CLAVE, JSON.stringify({ dia: "2026-10-03" }));

    expect(leerHistorial()).toEqual([]);
  });

  it("descarta las entradas con forma inválida y se queda con las buenas", () => {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify([partida("2026-10-01"), { dia: "ayer", ganada: "sí" }, null, partida("2026-10-02"), { dia: "2026-10-03" }]),
    );

    expect(leerHistorial().map((p) => p.dia)).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("si el navegador bloquea el almacenamiento, no rompe: lee vacío y guardar no hace nada", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(leerHistorial()).toEqual([]);
    expect(() => guardarPartida(partida("2026-10-03"))).not.toThrow();
  });
});
