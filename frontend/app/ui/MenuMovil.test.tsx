import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MenuMovil } from "./MenuMovil";

afterEach(cleanup);

const ENLACES = [
  { href: "/jugar", etiqueta: "Jugar" },
  { href: "/archivo", etiqueta: "Archivo" },
];

const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));

describe("MenuMovil", () => {
  it("arranca cerrado, sin mostrar los enlaces", () => {
    render(<MenuMovil enlaces={ENLACES} />);

    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Jugar" })).toBeNull();
  });

  it("al tocar el botón muestra los enlaces y las dos acciones", () => {
    render(<MenuMovil enlaces={ENLACES} />);

    abrir();

    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Jugar" })).toHaveAttribute("href", "/jugar");
    expect(screen.getByRole("link", { name: "Archivo" })).toHaveAttribute("href", "/archivo");
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jugar el diario" })).toBeInTheDocument();
  });

  it("se cierra al tocar el botón otra vez", () => {
    render(<MenuMovil enlaces={ENLACES} />);

    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar menú" }));

    expect(screen.queryByRole("link", { name: "Jugar" })).toBeNull();
  });

  it("se cierra al elegir un enlace", () => {
    render(<MenuMovil enlaces={ENLACES} />);

    abrir();
    fireEvent.click(screen.getByRole("link", { name: "Archivo" }));

    expect(screen.queryByRole("link", { name: "Archivo" })).toBeNull();
  });

  it("se cierra con la tecla Escape", () => {
    render(<MenuMovil enlaces={ENLACES} />);

    abrir();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("link", { name: "Jugar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir menú" })).toBeInTheDocument();
  });
});
