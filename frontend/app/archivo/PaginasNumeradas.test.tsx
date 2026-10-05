import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaginasNumeradas, numerosDePagina } from "./PaginasNumeradas";

afterEach(cleanup);

describe("numerosDePagina", () => {
  it("con pocas páginas las muestra todas", () => {
    expect(numerosDePagina(1, 1)).toEqual([1]);
    expect(numerosDePagina(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("al principio muestra las primeras, puntos suspensivos y la última", () => {
    expect(numerosDePagina(1, 13)).toEqual([1, 2, 3, 4, 5, "…", 13]);
  });

  it("al final muestra la primera, puntos suspensivos y las últimas", () => {
    expect(numerosDePagina(13, 13)).toEqual([1, "…", 9, 10, 11, 12, 13]);
  });

  it("en el medio muestra la primera, la vecindad y la última", () => {
    expect(numerosDePagina(7, 13)).toEqual([1, "…", 6, 7, 8, "…", 13]);
  });

  it("no deja un hueco de una sola página (la muestra en vez de los puntos)", () => {
    expect(numerosDePagina(4, 13)).toEqual([1, 2, 3, 4, 5, "…", 13]);
    expect(numerosDePagina(10, 13)).toEqual([1, "…", 9, 10, 11, 12, 13]);
  });
});

describe("PaginasNumeradas", () => {
  it("no aparece con una sola página", () => {
    const { container } = render(<PaginasNumeradas pagina={1} paginas={1} ruta="/archivo" parametros={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("cada número es un enlace que conserva los filtros, y la actual está marcada", () => {
    render(<PaginasNumeradas pagina={2} paginas={13} ruta="/archivo" parametros={{ genero: "Rock", q: "luna" }} />);

    const navegacion = screen.getByRole("navigation", { name: "Páginas" });
    expect(within(navegacion).getByRole("link", { name: "Página 3" })).toHaveAttribute("href", "/archivo?genero=Rock&q=luna&pagina=3");
    expect(within(navegacion).getByRole("link", { name: "Página 1" })).toHaveAttribute("href", "/archivo?genero=Rock&q=luna");
    expect(within(navegacion).getByText("2")).toHaveAttribute("aria-current", "page");
    expect(within(navegacion).getByRole("link", { name: "Página 13" })).toBeInTheDocument();
  });

  it("tiene flechas a la anterior y la siguiente, y en los extremos esa flecha no es un enlace", () => {
    const { rerender } = render(<PaginasNumeradas pagina={1} paginas={5} ruta="/archivo" parametros={{}} />);
    expect(screen.queryByRole("link", { name: "Página anterior" })).toBeNull();
    expect(screen.getByRole("link", { name: "Página siguiente" })).toHaveAttribute("href", "/archivo?pagina=2");

    rerender(<PaginasNumeradas pagina={5} paginas={5} ruta="/archivo" parametros={{}} />);
    expect(screen.getByRole("link", { name: "Página anterior" })).toHaveAttribute("href", "/archivo?pagina=4");
    expect(screen.queryByRole("link", { name: "Página siguiente" })).toBeNull();
  });

  it("los puntos suspensivos no son enlaces", () => {
    render(<PaginasNumeradas pagina={1} paginas={13} ruta="/archivo" parametros={{}} />);

    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "…" })).toBeNull();
  });

  it("los valores de los filtros se escapan", () => {
    render(<PaginasNumeradas pagina={1} paginas={2} ruta="/archivo" parametros={{ q: "a&b=c" }} />);

    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute("href", "/archivo?q=a%26b%3Dc&pagina=2");
  });
});
