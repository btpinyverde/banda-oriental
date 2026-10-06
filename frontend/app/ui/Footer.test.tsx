import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const conRedes = () => {
  vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_URL", "https://www.instagram.com/bandaoriental");
  vi.stubEnv("NEXT_PUBLIC_TIKTOK_URL", "https://www.tiktok.com/@bandaoriental");
};

describe("Footer completo", () => {
  it("lleva las columnas de enlaces y las redes que existen, con su dirección real y abriendo en otra pestaña", () => {
    conRedes();
    render(<Footer />);

    expect(screen.getByRole("navigation", { name: "Explorar" })).toBeInTheDocument();
    const instagram = screen.getByRole("link", { name: "Instagram" });
    expect(instagram).toHaveAttribute("href", "https://www.instagram.com/bandaoriental");
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(instagram).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByRole("link", { name: "TikTok" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Spotify" })).toBeNull();
  });

  it("sin redes configuradas no muestra ningún botón de red ni deja una lista vacía", () => {
    const { container } = render(<Footer />);

    expect(screen.queryByRole("link", { name: /Instagram|TikTok|Spotify/ })).toBeNull();
    expect(container.querySelector(".footer__redes")).toBeNull();
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });
});

describe("Footer mínimo", () => {
  it("deja solo el logo, los enlaces legales y el copyright", () => {
    render(<Footer variante="minimo" />);

    expect(screen.getByRole("link", { name: "Banda Oriental, inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByText(/© 2026 Banda Oriental/)).toBeInTheDocument();
    for (const [nombre, href] of [["Términos", "/terminos"], ["Privacidad", "/privacidad"], ["Contacto", "/contacto"]]) {
      expect(screen.getByRole("link", { name: nombre })).toHaveAttribute("href", href);
    }
  });

  it("no trae las columnas, las redes ni los adornos de la versión completa", () => {
    const { container } = render(<Footer variante="minimo" />);

    expect(screen.queryByRole("navigation", { name: "Explorar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Instagram" })).toBeNull();
    expect(container.querySelector(".footer__deco, .footer__arte")).toBeNull();
    expect(container.querySelector("footer")).toHaveClass("footer--minimo");
  });
});

describe("Footer compacto", () => {
  it("deja el logo, el lema, las redes y los enlaces legales en una sola fila", () => {
    conRedes();
    const { container } = render(<Footer variante="compacto" />);

    expect(screen.getByRole("link", { name: "Banda Oriental, inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByText("El juego de la música uruguaya.")).toBeInTheDocument();
    for (const red of ["Instagram", "TikTok"]) {
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
