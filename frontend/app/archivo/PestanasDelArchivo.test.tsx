import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PestanasDelArchivo } from "./PestanasDelArchivo";

afterEach(cleanup);

describe("PestanasDelArchivo", () => {
  it("lleva a las tres vistas del archivo, cada una con su cantidad, y marca la actual", () => {
    render(<PestanasDelArchivo actual="canciones" cantidades={{ canciones: 72632, artistas: 4218, discos: 8532 }} />);

    const nav = screen.getByRole("navigation", { name: "Qué explorar" });
    const canciones = within(nav).getByRole("link", { name: /Canciones/ });
    expect(canciones).toHaveAttribute("href", "/archivo");
    expect(canciones).toHaveAttribute("aria-current", "page");
    expect(canciones).toHaveTextContent("72.632");
    const artistas = within(nav).getByRole("link", { name: /Artistas/ });
    expect(artistas).toHaveAttribute("href", "/archivo/artistas");
    expect(artistas).not.toHaveAttribute("aria-current");
    expect(artistas).toHaveTextContent("4.218");
    expect(within(nav).getByRole("link", { name: /Discos/ })).toHaveAttribute("href", "/archivo/discos");
  });

  it("si no se sabe una cantidad no la inventa: queda el nombre solo", () => {
    render(<PestanasDelArchivo actual="artistas" cantidades={{ canciones: 100, artistas: null, discos: null }} />);

    expect(screen.getByRole("link", { name: "Artistas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Discos" })).toBeInTheDocument();
  });
});
