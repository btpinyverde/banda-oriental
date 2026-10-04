import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Footer } from "./Footer";

afterEach(cleanup);

describe("Footer completo", () => {
  it("lleva las columnas de enlaces y las redes", () => {
    render(<Footer />);

    expect(screen.getByRole("navigation", { name: "Explorar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Instagram" })).toBeInTheDocument();
  });
});

describe("Footer compacto", () => {
  it("deja el logo, el lema, las redes y los enlaces legales en una sola fila", () => {
    const { container } = render(<Footer variante="compacto" />);

    expect(screen.getByRole("link", { name: "Banda Oriental, inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByText("El juego de la música uruguaya.")).toBeInTheDocument();
    for (const red of ["Instagram", "TikTok", "Spotify"]) {
      expect(screen.getByRole("link", { name: red })).toBeInTheDocument();
    }
    for (const [nombre, href] of [["Términos", "/terminos"], ["Privacidad", "/privacidad"], ["Contacto", "/contacto"]]) {
      expect(screen.getByRole("link", { name: nombre })).toHaveAttribute("href", href);
    }
    expect(container.querySelector("footer")).toHaveClass("footer--compacto");
  });

  it("no trae las columnas ni los adornos de la versión completa", () => {
    const { container } = render(<Footer variante="compacto" />);

    expect(screen.queryByRole("navigation", { name: "Explorar" })).toBeNull();
    expect(container.querySelector(".footer__deco, .footer__arte")).toBeNull();
  });
});
