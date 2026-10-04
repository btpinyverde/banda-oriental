import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCuenta } from "../lib/cuenta/api-cuenta";
import { borrarSesion, guardarSesion } from "../lib/cuenta/sesion";
import { leerHistorial } from "../lib/juego/almacen-historial";
import { SincronizarCuenta } from "./SincronizarCuenta";

const dia = {
  day: "2026-10-03",
  finished: true,
  won: true,
  winning_attempt: 2,
  score: 150,
  attempts: [],
  song: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo", year: 2004 },
};

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const apiCon = (historial = vi.fn().mockResolvedValue([dia])) => ({ historial }) as unknown as ApiCuenta & { historial: typeof historial };

describe("SincronizarCuenta", () => {
  it("con sesión trae el historial de la cuenta al dispositivo", async () => {
    guardarSesion({ token: "tok-1", email: "ana@example.com" });
    const cliente = apiCon();

    render(<SincronizarCuenta api={cliente} />);
    await act(async () => {});

    expect(cliente.historial).toHaveBeenCalledWith("tok-1");
    expect(leerHistorial().map((p) => p.dia)).toEqual(["2026-10-03"]);
  });

  it("sin sesión no pide nada", async () => {
    const cliente = apiCon();

    render(<SincronizarCuenta api={cliente} />);
    await act(async () => {});

    expect(cliente.historial).not.toHaveBeenCalled();
  });

  it("al iniciar sesión después, sincroniza en ese momento", async () => {
    const cliente = apiCon();
    render(<SincronizarCuenta api={cliente} />);

    await act(async () => guardarSesion({ token: "tok-2", email: "ana@example.com" }));

    expect(cliente.historial).toHaveBeenCalledWith("tok-2");
  });

  it("una sola vez por sesión (no repite cada vez que cambia otra cosa)", async () => {
    guardarSesion({ token: "tok-1", email: "ana@example.com" });
    const cliente = apiCon();
    render(<SincronizarCuenta api={cliente} />);
    await act(async () => {});

    await act(async () => window.dispatchEvent(new Event("storage")));

    expect(cliente.historial).toHaveBeenCalledTimes(1);
  });

  it("al cerrar la sesión no vuelve a pedir", async () => {
    guardarSesion({ token: "tok-1", email: "ana@example.com" });
    const cliente = apiCon();
    render(<SincronizarCuenta api={cliente} />);
    await act(async () => {});

    await act(async () => borrarSesion());

    expect(cliente.historial).toHaveBeenCalledTimes(1);
  });
});
