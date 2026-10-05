import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EsqueletoDelJuego } from "./EsqueletoDelJuego";

afterEach(cleanup);

describe("EsqueletoDelJuego", () => {
  it("dibuja la forma completa del juego en gris: título, reproductor, cuatro pistas, seis filas de intentos y el buscador", () => {
    const { container } = render(<EsqueletoDelJuego tardando={false} />);

    expect(container.querySelectorAll(".esqueleto__pista")).toHaveLength(4);
    expect(container.querySelectorAll(".esqueleto__fila")).toHaveLength(6);
    for (const parte of [".esqueleto__titulo", ".esqueleto__reproductor", ".esqueleto__buscador"]) {
      expect(container.querySelector(parte), parte).not.toBeNull();
    }
  });

  it("todo el dibujo es decoración: está oculto para los lectores de pantalla y no hay nada para tocar", () => {
    const { container } = render(<EsqueletoDelJuego tardando={false} />);

    expect(container.querySelector(".esqueleto__dibujo")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("lleva un solo aviso de carga y la zona figura como ocupada", () => {
    const { container } = render(<EsqueletoDelJuego tardando={false} />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando la canción de hoy…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("si tarda, explica que el servidor está despertando; si no, no dice nada", () => {
    const { rerender } = render(<EsqueletoDelJuego tardando={false} />);
    expect(screen.queryByText(/está despertando/)).toBeNull();

    rerender(<EsqueletoDelJuego tardando />);

    expect(screen.getByText(/está despertando/)).toBeInTheDocument();
  });

  it("el aviso es una cápsula chica y no una ventana que tapa el dibujo", () => {
    const { container } = render(<EsqueletoDelJuego tardando={false} />);

    expect(container.querySelector(".esqueleto__ventana")).toBeNull();
    expect(container.querySelector(".esqueleto__aviso")).not.toBeNull();
  });
});
