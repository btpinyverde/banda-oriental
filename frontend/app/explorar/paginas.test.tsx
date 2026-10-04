import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalogo from "../lib/catalogo";
import PaginaArtistas, { metadata as metaArtistas } from "../artistas/page";
import PaginaEpocas, { metadata as metaEpocas } from "../epocas/page";
import PaginaGeneros, { metadata as metaGeneros } from "../generos/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const discos: catalogo.DiscoDelCatalogo[] = [
  { artista: "Jorge Drexler", disco: "Vaivén", anio: 1996, genero: "pop", canciones: 12 },
  { artista: "Rubén Rada", disco: "Montevideo", anio: 1990, genero: "candombe", canciones: 9 },
];

describe("las tres páginas de explorar el catálogo", () => {
  it("/artistas lista a los artistas con un buscador", async () => {
    vi.spyOn(catalogo, "obtenerDiscos").mockResolvedValue(discos);

    render(await PaginaArtistas());

    expect(screen.getByRole("heading", { level: 1, name: "Artistas" })).toBeInTheDocument();
    expect(screen.getByText("Jorge Drexler")).toBeInTheDocument();
    expect(screen.getByText("Rubén Rada")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("/epocas agrupa por década, con el artista de cada disco", async () => {
    vi.spyOn(catalogo, "obtenerDiscos").mockResolvedValue(discos);

    render(await PaginaEpocas());

    expect(screen.getByRole("heading", { level: 1, name: "Épocas" })).toBeInTheDocument();
    expect(screen.getByText("Años 1990")).toBeInTheDocument();
    expect(screen.getByText(/Montevideo/, { selector: "li *, li" })).toBeInTheDocument();
  });

  it("/generos agrupa por género, con buscador", async () => {
    vi.spyOn(catalogo, "obtenerDiscos").mockResolvedValue(discos);

    render(await PaginaGeneros());

    expect(screen.getByRole("heading", { level: 1, name: "Géneros" })).toBeInTheDocument();
    expect(screen.getByText("pop")).toBeInTheDocument();
    expect(screen.getByText("candombe")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it.each([
    ["artistas", PaginaArtistas],
    ["épocas", PaginaEpocas],
    ["géneros", PaginaGeneros],
  ])("si la API no responde, %s igual carga y lo explica", async (_nombre, Pagina) => {
    vi.spyOn(catalogo, "obtenerDiscos").mockResolvedValue(null);

    render(await Pagina());

    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar el catálogo/);
  });

  it.each([
    ["artistas", metaArtistas, "/artistas"],
    ["épocas", metaEpocas, "/epocas"],
    ["géneros", metaGeneros, "/generos"],
  ])("%s tiene título, descripción y dirección propios para los buscadores", (_nombre, meta, ruta) => {
    expect(String(meta.title).length).toBeGreaterThan(3);
    expect(String(meta.description).length).toBeGreaterThan(40);
    expect(meta.alternates?.canonical).toBe(ruta);
    expect(meta.robots).toBeUndefined();
  });

  it("nunca muestra la canción del día: solo discos del catálogo", async () => {
    vi.spyOn(catalogo, "obtenerDiscos").mockResolvedValue(discos);

    render(await PaginaArtistas());

    expect(screen.queryByText(/canción de hoy|canción del día/i)).toBeNull();
  });
});
