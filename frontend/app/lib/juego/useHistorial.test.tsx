import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardarPartida } from "./almacen-historial";
import type { Partida } from "./historial";
import { useHistorial } from "./useHistorial";

const partida = (dia: string): Partida => ({
  dia,
  ganada: true,
  intentos: 2,
  cancion: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
});

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("useHistorial", () => {
  it("devuelve lo que ya estaba guardado en el dispositivo", () => {
    guardarPartida(partida("2026-10-01"));

    const { result } = renderHook(() => useHistorial());

    expect(result.current.map((p) => p.dia)).toEqual(["2026-10-01"]);
  });

  it("empieza vacío si no hay nada", () => {
    const { result } = renderHook(() => useHistorial());

    expect(result.current).toEqual([]);
  });

  it("se actualiza solo cuando se guarda una partida nueva", () => {
    const { result } = renderHook(() => useHistorial());

    act(() => guardarPartida(partida("2026-10-02")));

    expect(result.current.map((p) => p.dia)).toEqual(["2026-10-02"]);
  });

  it("se actualiza cuando otra pestaña cambia el historial", () => {
    const { result } = renderHook(() => useHistorial());

    act(() => {
      window.localStorage.setItem("banda-oriental:historial", JSON.stringify([partida("2026-10-05")]));
      window.dispatchEvent(new StorageEvent("storage", { key: "banda-oriental:historial" }));
    });

    expect(result.current.map((p) => p.dia)).toEqual(["2026-10-05"]);
  });
});
