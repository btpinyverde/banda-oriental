import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarSesion } from "../lib/cuenta/sesion";
import { PantallaLogin } from "./PantallaLogin";

const empujar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: empujar }) }));

beforeEach(() => {
  window.localStorage.clear();
  empujar.mockClear();
});
afterEach(cleanup);

describe("PantallaLogin", () => {
  it("sin sesión muestra el formulario para entrar o crear la cuenta", () => {
    render(<PantallaLogin />);

    expect(screen.getByRole("tab", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Crear cuenta" })).toBeInTheDocument();
  });

  it("con la sesión ya iniciada no pide entrar de nuevo: ofrece ir a Mi cuenta o jugar", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    render(<PantallaLogin />);

    expect(screen.getByText(/Ya iniciaste sesión/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.queryByRole("tab", { name: "Entrar" })).toBeNull();
  });
});
