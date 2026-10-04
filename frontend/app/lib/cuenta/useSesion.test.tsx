import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { borrarSesion, guardarSesion } from "./sesion";
import { useSesion } from "./useSesion";

beforeEach(() => window.localStorage.clear());

describe("useSesion", () => {
  it("lee la sesión guardada y avisa que ya la leyó", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    const { result } = renderHook(() => useSesion());

    expect(result.current).toEqual({ sesion: { token: "abc", email: "ana@example.com" }, lista: true });
  });

  it("sin sesión devuelve null, pero igual avisa que ya miró", () => {
    const { result } = renderHook(() => useSesion());

    expect(result.current).toEqual({ sesion: null, lista: true });
  });

  it("se actualiza al iniciar y al cerrar la sesión", () => {
    const { result } = renderHook(() => useSesion());

    act(() => guardarSesion({ token: "abc", email: "ana@example.com" }));
    expect(result.current.sesion?.token).toBe("abc");

    act(() => borrarSesion());
    expect(result.current.sesion).toBeNull();
  });

  it("se actualiza cuando otra pestaña cambia la sesión", () => {
    const { result } = renderHook(() => useSesion());

    act(() => {
      window.localStorage.setItem("banda-oriental:sesion", JSON.stringify({ token: "otra", email: "ana@example.com" }));
      window.dispatchEvent(new Event("storage"));
    });

    expect(result.current.sesion?.token).toBe("otra");
  });
});
