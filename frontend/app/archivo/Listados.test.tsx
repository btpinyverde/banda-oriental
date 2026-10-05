import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilaDeCancion, FilaDeDisco, FilaDeArtista, Paginacion, duracion } from "./Listados";

afterEach(cleanup);

describe("duracion", () => {
  it("minutos y segundos, y nada si no se sabe", () => {
    expect(duracion(225)).toBe("3:45");
    expect(duracion(61)).toBe("1:01");
    expect(duracion(null)).toBe("");
    expect(duracion(0)).toBe("");
  });
});

describe("Paginacion", () => {
  it("no aparece si hay una sola página", () => {
    const { container } = render(<Paginacion pagina={1} paginas={1} ruta="/archivo/artistas" parametros={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("enlaza a la anterior y la siguiente, conservando los filtros, y marca la actual", () => {
    render(<Paginacion pagina={2} paginas={5} ruta="/archivo/discos" parametros={{ decada: "1990", genero: "Folk" }} />);

    const navegacion = screen.getByRole("navigation", { name: "Páginas" });
    expect(within(navegacion).getByRole("link", { name: "Anterior" })).toHaveAttribute("href", "/archivo/discos?decada=1990&genero=Folk");
    expect(within(navegacion).getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/archivo/discos?decada=1990&genero=Folk&pagina=3");
    expect(within(navegacion).getByText("Página 2 de 5")).toHaveAttribute("aria-current", "page");
  });

  it("en la primera no hay 'Anterior' y en la última no hay 'Siguiente'", () => {
    const { rerender } = render(<Paginacion pagina={1} paginas={3} ruta="/x" parametros={{}} />);
    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull();
    expect(screen.getByRole("link", { name: "Siguiente" })).toBeInTheDocument();

    rerender(<Paginacion pagina={3} paginas={3} ruta="/x" parametros={{}} />);
    expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull();
  });

  it("los valores de los filtros se escapan en la dirección", () => {
    render(<Paginacion pagina={1} paginas={2} ruta="/x" parametros={{ q: "a&b=c" }} />);

    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/x?q=a%26b%3Dc&pagina=2");
  });
});

describe("filas", () => {
  it("el artista dice cuántos discos y canciones tiene y de qué años", () => {
    render(<FilaDeArtista artista={{ id: 7, name: "Jorge Drexler", albums: 2, songs: 3, first_year: 1996, last_year: 2004 }} />);

    const enlace = screen.getByRole("link", { name: /Jorge Drexler/ });
    expect(enlace).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(enlace.closest("li")).toHaveTextContent("2 discos");
    expect(enlace.closest("li")).toHaveTextContent("3 canciones");
    expect(enlace.closest("li")).toHaveTextContent("1996");
  });

  it("singular cuando es uno", () => {
    render(<FilaDeArtista artista={{ id: 1, name: "Solo", albums: 1, songs: 1, first_year: 2000, last_year: 2000 }} />);

    expect(screen.getByRole("listitem")).toHaveTextContent("1 disco · 1 canción");
  });

  it("el disco lleva su artista (con enlace), el año, el género y la cantidad de canciones", () => {
    render(<FilaDeDisco disco={{ id: 12, name: "Vaivén", artist: { id: 7, name: "Jorge Drexler" }, year: 1996, genre: "Folk", release_type: "album", songs: 2, cover_art_url: "" }} />);

    expect(screen.getByRole("link", { name: "Vaivén" })).toHaveAttribute("href", "/archivo/disco/12-vaiven");
    expect(screen.getByRole("link", { name: "Jorge Drexler" })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(screen.getByRole("listitem")).toHaveTextContent("1996");
    expect(screen.getByRole("listitem")).toHaveTextContent("Folk");
    expect(screen.getByRole("listitem")).toHaveTextContent("2 canciones");
  });

  it("el disco sin año ni género no muestra huecos ni 'null'", () => {
    render(<FilaDeDisco disco={{ id: 1, name: "Sin datos", artist: { id: 2, name: "A" }, year: null, genre: "", release_type: "album", songs: 1, cover_art_url: "" }} />);

    expect(screen.getByRole("listitem").textContent).not.toMatch(/null|undefined|\(\)/);
  });

  it("la canción distingue a las que se llaman igual por su artista y disco, y dice si fue la del día (solo días vencidos)", () => {
    render(
      <FilaDeCancion
        cancion={{ id: 5, title: "Luna negra", duration_seconds: 225, artist: { id: 7, name: "Jorge Drexler" }, album: { id: 12, name: "Vaivén", year: 1996, genre: "Folk" }, played_on: "2026-10-02" }}
      />,
    );

    const fila = screen.getByRole("listitem");
    expect(fila).toHaveTextContent("Jorge Drexler");
    expect(fila).toHaveTextContent("Vaivén (1996)");
    expect(fila).toHaveTextContent("3:45");
    expect(within(fila).getByRole("link", { name: /Fue la canción del día/ })).toHaveAttribute("href", "/anteriores/2026-10-02");
  });

  it("la canción que nunca fue la del día no dice nada de eso", () => {
    render(<FilaDeCancion cancion={{ id: 5, title: "Luna", duration_seconds: null, artist: { id: 7, name: "A" }, album: { id: 12, name: "D", year: null, genre: "" }, played_on: null }} />);

    expect(screen.queryByText(/canción del día/)).toBeNull();
  });
});
