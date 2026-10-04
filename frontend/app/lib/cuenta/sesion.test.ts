import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { borrarSesion, EVENTO_SESION, guardarSesion, leerSesion } from "./sesion";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("sesión", () => {
  it("no hay sesión hasta que se guarda una", () => {
    expect(leerSesion()).toBeNull();
  });

  it("guarda y devuelve el token y el correo", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    expect(leerSesion()).toEqual({ token: "abc", email: "ana@example.com" });
  });

  it("la guarda aparte del historial y de los datos del día (clave propia)", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    expect(window.localStorage.getItem("banda-oriental:sesion")).not.toBeNull();
    expect(window.localStorage.getItem("banda-oriental:historial")).toBeNull();
  });

  it("borrarSesion la quita", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    borrarSesion();

    expect(leerSesion()).toBeNull();
  });

  it("avisa en la misma pestaña cuando se guarda o se borra", () => {
    const escucha = vi.fn();
    window.addEventListener(EVENTO_SESION, escucha);

    guardarSesion({ token: "abc", email: "ana@example.com" });
    borrarSesion();

    expect(escucha).toHaveBeenCalledTimes(2);
    window.removeEventListener(EVENTO_SESION, escucha);
  });

  it.each([
    ["no es JSON", "{roto"],
    ["no es un objeto", '"hola"'],
    ["falta el token", JSON.stringify({ email: "ana@example.com" })],
    ["el token está vacío", JSON.stringify({ token: "", email: "ana@example.com" })],
    ["el token no es texto", JSON.stringify({ token: 5, email: "ana@example.com" })],
  ])("ignora datos que no sirven (%s)", (_motivo, crudo) => {
    window.localStorage.setItem("banda-oriental:sesion", crudo);

    expect(leerSesion()).toBeNull();
  });

  it("si el almacenamiento está bloqueado no rompe", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(leerSesion()).toBeNull();
    expect(() => guardarSesion({ token: "abc", email: "ana@example.com" })).not.toThrow();
  });
});
