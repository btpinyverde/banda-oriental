import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as datos from "./lib/archivo-musical";
import Home from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const artista = (id: number, name: string, songs: number, foto = "") => ({ id, name, albums: 1, songs, first_year: 2000, last_year: 2000, cover_art_url: "", picture_url: foto });

describe("la portada: Explorá el archivo con datos reales", () => {
  const preparar = () => {
    const artistas = vi.spyOn(datos, "listarArtistas").mockResolvedValue({ count: 420, page: 1, pages: 35, results: [artista(7, "Jorge Drexler", 120, "https://img/d.jpg"), artista(9, "Rubén Rada", 90)] });
    vi.spyOn(datos, "listarCanciones").mockResolvedValue({ count: 16316, page: 1, pages: 800, results: [] });
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue({ decades: [], genres: [{ genre: "Rock", albums: 32 }, { genre: "Candombe", albums: 17 }], years: { min: 1960, max: 2026 } });
    return artistas;
  };

  it("muestra a los artistas con más canciones, con sus años, y cada uno lleva a su ficha", async () => {
    const artistas = preparar();

    render(await Home());

    expect(artistas).toHaveBeenCalledWith(expect.objectContaining({ orden: "songs" }));
    const carrusel = screen.getByRole("region", { name: "Explorá el archivo" });
    expect(within(carrusel).getByRole("link", { name: /Jorge Drexler/ })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(within(carrusel).getByRole("img", { name: /Jorge Drexler/ })).toHaveAttribute("src", "https://img/d.jpg");
    expect(within(carrusel).queryByRole("img", { name: /Rubén Rada/ })).toBeNull(); // sin foto: la inicial, no una imagen inventada
    expect(within(carrusel).getByText("120 canciones")).toBeInTheDocument();
    expect(within(carrusel).getAllByText("2000").length).toBeGreaterThan(0);
  });

  it("la bajada usa el total real de canciones y los géneros son los del catálogo", async () => {
    preparar();

    render(await Home());

    expect(screen.getByText(/Más de 16\.300 canciones/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Candombe" })).toHaveAttribute("href", "/archivo/discos?genero=Candombe");
  });

  it("ya no hay nombres ni cifras de ejemplo", async () => {
    preparar();

    render(await Home());

    const carrusel = screen.getByRole("region", { name: "Explorá el archivo" });
    expect(within(carrusel).queryByText("No Te Va Gustar")).toBeNull();
    expect(within(carrusel).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("si la API no responde la portada sale igual, con el aviso de la sección vacía y sin romperse", async () => {
    vi.spyOn(datos, "listarArtistas").mockResolvedValue(null);
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(null);
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(null);

    render(await Home());

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay artistas en el archivo.")).toBeInTheDocument();
  });
});
