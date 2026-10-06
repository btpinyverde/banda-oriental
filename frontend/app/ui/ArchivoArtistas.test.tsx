import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArchivoArtistas, textoCatalogo, type ArtistaArchivo } from "./ArchivoArtistas";

afterEach(cleanup);

const artista = (nombre: string, canciones: number, anios?: string, id = nombre.length, foto?: string): ArtistaArchivo => ({
  id,
  nombre,
  canciones,
  foto,
  href: `/archivo/artista/${id}-${nombre.toLowerCase().replace(/\s+/g, "-")}`,
  anios,
});

const ARTISTAS = [
  artista("No Te Va Gustar", 28, "1999–2026", 1),
  artista("Jorge Drexler", 16, "1996–2004", 2),
  artista("Rada", 6, undefined, 3),
];

const GENEROS = ["Rock", "Pop", "Candombe", "Folklore"];

const renderizar = (props: Partial<Parameters<typeof ArchivoArtistas>[0]> = {}) =>
  render(<ArchivoArtistas artistas={ARTISTAS} generos={GENEROS} totalCanciones={137} {...props} />);

describe("textoCatalogo", () => {
  it("redondea hacia abajo a la centena cuando hay 100 canciones o más", () => {
    expect(textoCatalogo(137)).toBe("Más de 100 canciones de todas las épocas, géneros y rincones del Uruguay.");
    expect(textoCatalogo(16316)).toBe("Más de 16.300 canciones de todas las épocas, géneros y rincones del Uruguay.");
  });

  it("dice la cantidad exacta cuando hay menos de 100", () => {
    expect(textoCatalogo(42)).toBe("42 canciones de todas las épocas, géneros y rincones del Uruguay.");
    expect(textoCatalogo(1)).toBe("1 canción de todas las épocas, géneros y rincones del Uruguay.");
  });

  it("usa un texto general cuando no hay canciones", () => {
    expect(textoCatalogo(0)).toBe("Canciones uruguayas de todas las épocas, géneros y rincones del país.");
  });
});

describe("ArchivoArtistas", () => {
  it("muestra cada artista con su nombre, sus canciones y sus años, y lleva a su ficha", () => {
    renderizar();

    const tarjeta = screen.getByText("No Te Va Gustar").closest("li") as HTMLElement;
    expect(within(tarjeta).getByText("28 canciones")).toBeInTheDocument();
    expect(within(tarjeta).getByText("1999–2026")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("link", { name: /No Te Va Gustar/ })).toHaveAttribute("href", "/archivo/artista/1-no-te-va-gustar");
  });

  it("con la foto del artista la muestra; sin ella va la inicial sobre un color, nunca una imagen inventada", () => {
    renderizar({ artistas: [artista("Jorge Drexler", 16, undefined, 2, "https://cdn.example/d.jpg"), artista("Rada", 6, undefined, 3)] });

    const con = screen.getByText("Jorge Drexler").closest("li") as HTMLElement;
    expect(within(con).getByRole("img", { name: "Foto de Jorge Drexler" })).toHaveAttribute("src", "https://cdn.example/d.jpg");
    const sin = screen.getByText("Rada").closest("li") as HTMLElement;
    expect(within(sin).queryByRole("img")).toBeNull();
    expect(sin.querySelector(".artista__inicial")).toHaveTextContent("R");
  });

  it("la inicial de un nombre que empieza con un símbolo es la primera letra o número", () => {
    renderizar({ artistas: [artista("#TocoParaVos", 11), artista("¡Ay! Caramba", 3, undefined, 8), artista("ñandú", 2, undefined, 9)] });

    const iniciales = [...document.querySelectorAll(".artista__inicial")].map((n) => n.textContent);
    expect(iniciales).toEqual(["T", "A", "Ñ"]);
  });

  it("cada tarjeta tiene un color de la marca, siempre el mismo para el mismo artista", () => {
    const { container, unmount } = renderizar();
    const colores = () => [...container.querySelectorAll<HTMLElement>(".artista__foto")].map((n) => n.className);
    const primera = colores();
    expect(primera.every((c) => /artista__foto--tono-\d/.test(c))).toBe(true);
    unmount();

    const { container: otra } = renderizar();
    expect([...otra.querySelectorAll<HTMLElement>(".artista__foto")].map((n) => n.className)).toEqual(primera);
  });

  it("escribe en singular cuando el artista tiene una sola canción", () => {
    renderizar({ artistas: [artista("Solista", 1)] });
    expect(screen.getByText("1 canción")).toBeInTheDocument();
  });

  it("usa el total de canciones en la bajada", () => {
    renderizar({ totalCanciones: 250 });
    expect(screen.getByText(/Más de 200 canciones/)).toBeInTheDocument();
  });

  it("los géneros llevan a los discos de ese género del archivo, y 'Todos' al archivo", () => {
    renderizar();

    const generos = screen.getByRole("list", { name: "Explorar por género" });
    expect(within(generos).getByRole("link", { name: "Todos" })).toHaveAttribute("href", "/archivo");
    expect(within(generos).getByRole("link", { name: "Rock" })).toHaveAttribute("href", "/archivo/discos?genero=Rock");
    expect(within(generos).getByRole("link", { name: "Candombe" })).toHaveAttribute("href", "/archivo/discos?genero=Candombe");
  });

  it("el nombre de un género con caracteres especiales se escapa en la dirección", () => {
    renderizar({ generos: ["R&B / Soul"] });

    expect(screen.getByRole("link", { name: "R&B / Soul" })).toHaveAttribute("href", "/archivo/discos?genero=R%26B+%2F+Soul");
  });

  it("no muestra géneros ni flechas cuando el archivo está vacío, y lo dice", () => {
    renderizar({ artistas: [], generos: [], totalCanciones: 0 });

    expect(screen.getByText("Todavía no hay artistas en el archivo.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Explorar por género" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Siguiente" })).toBeNull();
  });

  it("enlaza a la lista completa de artistas del archivo", () => {
    renderizar();
    expect(screen.getByRole("link", { name: /Ver todos los artistas/ })).toHaveAttribute("href", "/archivo/artistas");
  });

  it("los colores de las tarjetas siguen el orden y no se repiten entre vecinas", () => {
    const { container } = renderizar({ artistas: [1, 2, 3, 4, 5, 6, 7].map((n) => artista(`Banda ${"x".repeat(n)}`, n, undefined, n)) });

    const tonos = [...container.querySelectorAll<HTMLElement>(".artista__foto")].map((n) => Number(/tono-(\d)/.exec(n.className)![1]));
    expect(tonos).toEqual([0, 1, 2, 3, 4, 0, 1]);
  });

  it("con foto recortada la muestra entera sobre el color, sin filtros, y no usa la foto de Deezer", () => {
    renderizar({ artistas: [{ ...artista("Indigo", 9, undefined, 4, "https://cdn.example/d.jpg"), recorte: "https://api.example/api/catalog/featured/4/image/?v=1" }] });

    const tarjeta = screen.getByText("Indigo").closest("li") as HTMLElement;
    const foto = within(tarjeta).getByRole("img", { name: "Foto de Indigo" });
    expect(foto).toHaveAttribute("src", "https://api.example/api/catalog/featured/4/image/?v=1");
    expect(tarjeta.querySelector(".artista__foto")).toHaveClass("artista__foto--recorte");
    expect(tarjeta.querySelector(".artista__foto")).not.toHaveClass("artista__foto--con-foto");
  });

  it("el recorte puede ser relativo (la API en el mismo sitio)", () => {
    renderizar({ artistas: [{ ...artista("Indigo", 9, undefined, 4), recorte: "/api/catalog/featured/4/image/?v=1" }] });

    expect(screen.getByRole("img", { name: "Foto de Indigo" })).toHaveAttribute("src", "/api/catalog/featured/4/image/?v=1");
  });
});
