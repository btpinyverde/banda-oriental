import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Hero } from "./Hero";

afterEach(cleanup);

describe("Hero", () => {
  it("tiene un solo llamado principal: jugar la canción de hoy", () => {
    render(<Hero />);

    expect(screen.getByRole("link", { name: /Jugar la canción de hoy/ })).toHaveAttribute("href", "/jugar");
    expect(screen.queryByRole("link", { name: /Modo batalla/ })).toBeNull();
  });

  it("ofrece ir a 'Cómo se juega', la sección de más abajo", () => {
    render(<Hero />);

    expect(screen.getByRole("link", { name: /¿Cómo se juega\?/ })).toHaveAttribute("href", "#como-se-juega");
  });

  it("dice lo esencial: seis intentos y una pista más con cada error", () => {
    render(<Hero />);

    expect(screen.getByText(/Seis intentos y cada error te da una pista más/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("");
    expect(screen.getByAltText("Adiviná la canción antes de que cante.")).toBeInTheDocument();
  });

  it("muestra las tres ventajas", () => {
    render(<Hero />);

    for (const texto of [/Canciones\s*uruguayas/, /Desafío\s*diario/, /Competí\s*con amigos/]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("la nota rosa de 'seis intentos, cuatro pistas' está en el hero (no en la sección de más abajo)", () => {
    const { container } = render(<Hero />);

    expect(container.querySelector('img[src="/assets/sticker-six-attempts-pink.svg"]')).not.toBeNull();
  });
});
