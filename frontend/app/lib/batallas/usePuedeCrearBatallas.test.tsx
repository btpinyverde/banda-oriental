import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { borrarSesion, guardarSesion } from "../cuenta/sesion";
import * as batallas from "./api-batallas";
import { usePuedeCrearBatallas } from "./usePuedeCrearBatallas";

function simularAcceso(respuesta: boolean | Error | "nunca") {
  const acceso = vi.fn();
  if (respuesta === "nunca") acceso.mockReturnValue(new Promise(() => {}));
  else if (respuesta instanceof Error) acceso.mockRejectedValue(respuesta);
  else acceso.mockResolvedValue(respuesta);
  vi.spyOn(batallas, "crearApiBatallas").mockReturnValue({ acceso } as unknown as ReturnType<typeof batallas.crearApiBatallas>);
  return acceso;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup(); // desmonta los hooks de la prueba anterior: si no, también preguntan cuando cambia la sesión de la siguiente
  vi.restoreAllMocks();
  borrarSesion();
});

describe("usePuedeCrearBatallas: lo decide siempre el servidor", () => {
  it("si el servidor dice que sí, puede (con o sin sesión: está abierto a todos)", async () => {
    simularAcceso(true);
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: true, lista: true });
  });

  it("si dice que no, no puede", async () => {
    guardarSesion({ token: "tok", email: "a@b.uy" });
    simularAcceso(false);
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: false, lista: true });
  });

  it("si el servidor no contesta, no puede (y no se rompe)", async () => {
    simularAcceso(new Error("sin conexión"));
    const { result } = renderHook(() => usePuedeCrearBatallas());

    await act(async () => {});
    expect(result.current).toEqual({ puede: false, lista: true });
  });

  it("mientras no sabe, todavía no está lista", () => {
    simularAcceso("nunca");
    const { result } = renderHook(() => usePuedeCrearBatallas());
    expect(result.current.lista).toBe(false);
  });

  it("al iniciar o cerrar sesión vuelve a preguntar (el permiso es de la cuenta)", async () => {
    const acceso = simularAcceso(false);
    const { result } = renderHook(() => usePuedeCrearBatallas());
    await act(async () => {});
    expect(acceso).toHaveBeenCalledTimes(1);

    acceso.mockResolvedValue(true);
    await act(async () => guardarSesion({ token: "tok", email: "a@b.uy" }));
    await act(async () => {});

    expect(acceso).toHaveBeenCalledTimes(2);
    expect(result.current.puede).toBe(true);
  });
});
