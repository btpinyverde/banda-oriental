import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AyudaColores } from "./AyudaColores";

afterEach(cleanup);

const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Cómo funciona" }));

describe("AyudaColores", () => {
  it("arranca cerrada, con el botón de ayuda a la vista", () => {
    render(<AyudaColores />);

    expect(screen.getByRole("button", { name: "Cómo funciona" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Cómo funciona" })).toBeNull();
  });

  it("al abrirla explica qué significa cada color y cómo se desbloquean las pistas", () => {
    render(<AyudaColores />);

    abrir();

    const ayuda = screen.getByRole("region", { name: "Cómo funciona" });
    expect(screen.getByRole("button", { name: "Cómo funciona" })).toHaveAttribute("aria-expanded", "true");
    expect(within(ayuda).getByText("Correcto")).toBeInTheDocument();
    expect(within(ayuda).getByText("La canción y el dato coinciden.")).toBeInTheDocument();
    expect(within(ayuda).getByText("Cerca")).toBeInTheDocument();
    expect(within(ayuda).getByText("El dato es correcto pero no exacto.")).toBeInTheDocument();
    expect(within(ayuda).getByText("Incorrecto")).toBeInTheDocument();
    expect(within(ayuda).getByText("El dato no coincide.")).toBeInTheDocument();
    expect(within(ayuda).getByText(/Cada error desbloquea una nueva pista/)).toBeInTheDocument();
  });

  it("usa los mismos colores que la tabla: verde, amarillo y rosa", () => {
    const { container } = render(<AyudaColores />);

    abrir();

    for (const clase of ["acierto", "cerca", "error"]) {
      expect(container.querySelector(`.ayuda__punto--${clase}`)).not.toBeNull();
    }
  });

  it("se cierra con el botón Cerrar, con Escape o tocando otra vez el signo de pregunta", () => {
    render(<AyudaColores />);

    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("region", { name: "Cómo funciona" })).toBeNull();

    abrir();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Cómo funciona" })).toBeNull();

    abrir();
    abrir();
    expect(screen.queryByRole("region", { name: "Cómo funciona" })).toBeNull();
  });
});
