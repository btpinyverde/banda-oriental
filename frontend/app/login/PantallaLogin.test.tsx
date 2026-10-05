import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("sin sesión muestra el formulario para entrar, con el camino a crear la cuenta", async () => {
    render(<PantallaLogin />);

    expect(await screen.findByRole("heading", { level: 1, name: "Iniciá sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creá una" })).toBeInTheDocument();
  });

  it("si la dirección dice ?modo=crear abre directamente en 'Creá tu cuenta'", async () => {
    window.history.replaceState(null, "", "/login?modo=crear");

    render(<PantallaLogin />);

    expect(await screen.findByRole("heading", { level: 1, name: "Creá tu cuenta" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/login");
  });

  it("el collage acompaña al modo: cambia al pasar de entrar a crear la cuenta", async () => {
    const { container } = render(<PantallaLogin />);
    await screen.findByRole("heading", { level: 1, name: "Iniciá sesión" });
    expect(container.querySelector(".colage-acceso--entrar")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Creá una" }));

    expect(container.querySelector(".colage-acceso--crear")).not.toBeNull();
    expect(container.querySelector(".colage-acceso--entrar")).toBeNull();
    window.history.replaceState(null, "", "/login");
  });

  it("el collage es decorativo", async () => {
    const { container } = render(<PantallaLogin />);
    await screen.findByRole("heading", { level: 1 });

    expect(container.querySelector(".colage-acceso")).toHaveAttribute("aria-hidden", "true");
  });

  it("con la sesión ya iniciada no pide entrar de nuevo: ofrece ir a Mi cuenta o jugar", () => {
    guardarSesion({ token: "abc", email: "ana@example.com" });

    render(<PantallaLogin />);

    expect(screen.getByText(/Ya iniciaste sesión/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
  });
});
