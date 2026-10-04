import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ArchivoArtistas, textoCatalogo, type ArtistaArchivo } from "./ArchivoArtistas";

afterEach(cleanup);

const artista = (nombre: string, canciones: number, generos: string[], tapa?: string): ArtistaArchivo => ({
  id: nombre,
  nombre,
  canciones,
  generos,
  tapa,
});

const ARTISTAS = [
  artista("No Te Va Gustar", 28, ["Rock"], "https://img.example/ntvg.jpg"),
  artista("Jorge Drexler", 16, ["Pop", "Folklore"], "https://img.example/drexler.jpg"),
  artista("Rada", 6, ["Candombe"]),
];

const GENEROS = ["Rock", "Pop", "Candombe", "Folklore"];

const renderizar = (props: Partial<Parameters<typeof ArchivoArtistas>[0]> = {}) =>
  render(<ArchivoArtistas artistas={ARTISTAS} generos={GENEROS} totalCanciones={137} {...props} />);

describe("textoCatalogo", () => {
  it("redondea hacia abajo a la centena cuando hay 100 canciones o más", () => {
    expect(textoCatalogo(137)).toBe("Más de 100 canciones de todas las épocas, géneros y rincones del Uruguay.");
    expect(textoCatalogo(250)).toBe("Más de 200 canciones de todas las épocas, géneros y rincones del Uruguay.");
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
  it("muestra cada artista con su nombre, sus canciones y su tapa", () => {
    renderizar();

    const tarjeta = screen.getByText("No Te Va Gustar").closest("li") as HTMLElement;
    expect(within(tarjeta).getByText("28 canciones")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("img")).toHaveAttribute("src", "https://img.example/ntvg.jpg");
  });

  it("escribe en singular cuando el artista tiene una sola canción", () => {
    renderizar({ artistas: [artista("Solista", 1, ["Rock"])] });
    expect(screen.getByText("1 canción")).toBeInTheDocument();
  });

  it("no inventa una imagen para un artista sin tapa", () => {
    renderizar();

    const tarjeta = screen.getByText("Rada").closest("li") as HTMLElement;
    expect(within(tarjeta).queryByRole("img")).toBeNull();
  });

  it("usa el total de canciones en la bajada", () => {
    renderizar({ totalCanciones: 250 });
    expect(screen.getByText(/Más de 200 canciones/)).toBeInTheDocument();
  });

  it("ofrece Todos más los géneros recibidos, con Todos activo al inicio", () => {
    renderizar();

    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rock" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Candombe" })).toBeInTheDocument();
  });

  it("filtra los artistas al elegir un género", () => {
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Candombe" }));

    expect(screen.getByText("Rada")).toBeInTheDocument();
    expect(screen.queryByText("No Te Va Gustar")).toBeNull();
    expect(screen.getByRole("button", { name: "Candombe" })).toHaveAttribute("aria-pressed", "true");
  });

  it("incluye a un artista en cada uno de sus géneros", () => {
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Folklore" }));

    expect(screen.getByText("Jorge Drexler")).toBeInTheDocument();
  });

  it("vuelve a mostrar todos al elegir Todos", () => {
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Candombe" }));
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));

    expect(screen.getByText("No Te Va Gustar")).toBeInTheDocument();
    expect(screen.getByText("Rada")).toBeInTheDocument();
  });

  it("avisa cuando un género no tiene artistas", () => {
    renderizar({ generos: [...GENEROS, "Tango"] });

    fireEvent.click(screen.getByRole("button", { name: "Tango" }));

    expect(screen.getByText("Todavía no hay artistas de este género.")).toBeInTheDocument();
  });

  it("no muestra géneros ni flechas cuando el archivo está vacío", () => {
    renderizar({ artistas: [], generos: [], totalCanciones: 0 });

    expect(screen.getByText("Todavía no hay artistas en el archivo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Todos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Siguiente" })).toBeNull();
  });

  it("enlaza a la página del archivo completo", () => {
    renderizar();
    expect(screen.getByRole("link", { name: /Ver todos los artistas/ })).toHaveAttribute("href", "/artistas");
  });
});
