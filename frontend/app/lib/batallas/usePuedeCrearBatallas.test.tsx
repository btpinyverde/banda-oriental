import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { borrarSesion, guardarSesion } from "../cuenta/sesion";
import * as cuenta from "../cuenta/api-cuenta";
import { usePuedeCrearBatallas } from "./usePuedeCrearBatallas";

const DATOS = { email: "a@b.uy", date_joined: "x", accepts_news: false, terms_accepted_at: null };

function simularYo(respuesta: unknown | Error) {
  const yo = vi.fn();
  if (respuesta instanceof Error) yo.mockRejectedValue(respuesta);
  else yo.mockResolvedValue(respuesta);
  vi.spyOn(cuenta, "crearApiCuenta").mockReturnValue({ yo } as unknown as ReturnType<typeof cuenta.crearApiCuenta>);
  return yo;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  borrarSesion();
});

describe("usePuedeCrearBatallas", () => {
  it("con el modo batalla encendido para todos, puede sin preguntar nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "1");
    const yo = simularYo(DATOS);
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: true, lista: true });
    expect(yo).not.toHaveBeenCalled();
  });

  it("sin sesión no puede", async () => {
    const yo = simularYo(DATOS);
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: false, lista: true });
    expect(yo).not.toHaveBeenCalled();
  });

  it("con una cuenta autorizada puede", async () => {
    guardarSesion({ token: "tok", email: "a@b.uy" });
    const yo = simularYo({ ...DATOS, can_create_battles: true });
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(yo).toHaveBeenCalledWith("tok");
    expect(result.current).toEqual({ puede: true, lista: true });
  });

  it("con una cuenta no autorizada no puede", async () => {
    guardarSesion({ token: "tok", email: "a@b.uy" });
    simularYo({ ...DATOS, can_create_battles: false });
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: false, lista: true });
  });

  it("si la API no contesta, no puede (y no se rompe)", async () => {
    guardarSesion({ token: "tok", email: "a@b.uy" });
    simularYo(new Error("sin conexión"));
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: false, lista: true });
  });

  it("mientras no sabe, todavía no está lista", () => {
    guardarSesion({ token: "tok", email: "a@b.uy" });
    vi.spyOn(cuenta, "crearApiCuenta").mockReturnValue({ yo: () => new Promise(() => {}) } as unknown as ReturnType<typeof cuenta.crearApiCuenta>);
    const { result } = renderHook(() => usePuedeCrearBatallas());
    expect(result.current.lista).toBe(false);
  });
});
