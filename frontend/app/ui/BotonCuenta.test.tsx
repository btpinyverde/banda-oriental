import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { borrarSesion, guardarSesion } from "../lib/cuenta/sesion";
import { BotonCuenta } from "./BotonCuenta";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("BotonCuenta", () => {
  it("sin sesión ofrece iniciar sesión", () => {
    render(<BotonCuenta className="boton" />);

    const enlace = screen.getByRole("link", { name: "Iniciar sesión" });
    expect(enlace).toHaveAttribute("href", "/login");
    expect(enlace).toHaveClass("boton");
  });

  it("con sesión lleva a Mi cuenta", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    render(<BotonCuenta className="boton" />);

    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.queryByRole("link", { name: "Iniciar sesión" })).toBeNull();
  });

  it("cambia cuando se inicia o se cierra la sesión", () => {
    render(<BotonCuenta className="boton" />);

    act(() => guardarSesion({ token: "abc", email: "ana@example.com" }));
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toBeInTheDocument();

    act(() => borrarSesion());
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
  });

  it("avisa al elegirlo (el menú del celular se cierra)", () => {
    const alElegir = vi.fn();
    render(<BotonCuenta className="boton" alElegir={alElegir} />);

    screen.getByRole("link", { name: "Iniciar sesión" }).click();

    expect(alElegir).toHaveBeenCalled();
  });
});
