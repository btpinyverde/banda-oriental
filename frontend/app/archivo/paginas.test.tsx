import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as datos from "../lib/archivo-musical";
import type { ArtistaFila, CancionFila, DiscoFila, Pagina } from "../lib/archivo-musical";
import PaginaArchivo, { metadata } from "./page";
import PaginaArtistas from "./artistas/page";
import PaginaDiscos from "./discos/page";
import PaginaCanciones from "./canciones/page";
import FichaArtista from "./artista/[ficha]/page";
import FichaDisco from "./disco/[ficha]/page";
import FichaCancion, { generateMetadata as metadataCancion } from "./cancion/[ficha]/page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pagina = <T,>(results: T[], extra: Partial<Pagina<T>> = {}): Pagina<T> => ({ count: results.length, page: 1, pages: 1, results, ...extra });
const ARTISTA: ArtistaFila = { id: 7, name: "Jorge Drexler", albums: 2, songs: 3, first_year: 1996, last_year: 2004, cover_art_url: "", picture_url: "" };
const DISCO: DiscoFila = { id: 12, name: "Vaivén", artist: { id: 7, name: "Jorge Drexler" }, year: 1996, genre: "Folk", release_type: "album", songs: 2, cover_art_url: "https://img/c.jpg" };
const CANCION: CancionFila = { id: 5, title: "Luna negra", duration_seconds: 225, artist: { id: 7, name: "Jorge Drexler" }, album: { id: 12, name: "Vaivén", year: 1996, genre: "Folk" }, played_on: null };
const FILTROS = { decades: [{ decade: 1990, albums: 3 }, { decade: 2000, albums: 5 }], genres: [{ genre: "Folk", albums: 2 }, { genre: "Rock", albums: 4 }], years: { min: 1990, max: 2009 } };
const buscaParams = (p: Record<string, string>) => Promise.resolve(p);
const ficha = (valor: string) => Promise.resolve({ ficha: valor });

describe("/archivo (portada del archivo)", () => {
  const preparar = () => {
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(FILTROS);
    vi.spyOn(datos, "listarArtistas").mockResolvedValue(pagina([ARTISTA], { count: 420 }));
    vi.spyOn(datos, "listarDiscos").mockResolvedValue(pagina([DISCO], { count: 1207 }));
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(pagina([CANCION], { count: 15678 }));
  };

  it("tiene el buscador y las tres puertas con cuántos hay de cada cosa", async () => {
    preparar();

    render(await PaginaArchivo());

    expect(screen.getByRole("heading", { level: 1, name: "Archivo" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar en el archivo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Artistas/ })).toHaveAttribute("href", "/archivo/artistas");
    expect(screen.getByRole("link", { name: /Artistas/ })).toHaveTextContent("420");
    expect(screen.getByRole("link", { name: /Discos/ })).toHaveAttribute("href", "/archivo/discos");
    expect(screen.getByRole("link", { name: /Canciones/ })).toHaveTextContent("15.678");
  });

  it("ofrece explorar por época y por género", async () => {
    preparar();

    render(await PaginaArchivo());

    expect(screen.getByRole("link", { name: /Años 90/ })).toHaveAttribute("href", "/archivo/discos?decada=1990");
    expect(screen.getByRole("link", { name: /Folk/ })).toHaveAttribute("href", "/archivo/discos?genero=Folk");
  });

  it("los juegos pasados no son el archivo, pero hay un camino a ellos", async () => {
    preparar();

    render(await PaginaArchivo());

    expect(screen.getByRole("link", { name: /juegos anteriores/i })).toHaveAttribute("href", "/anteriores");
  });

  it("si la API no responde, el buscador sigue y se avisa en lugar de mostrar ceros", async () => {
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(null);
    vi.spyOn(datos, "listarArtistas").mockResolvedValue(null);
    vi.spyOn(datos, "listarDiscos").mockResolvedValue(null);
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(null);

    render(await PaginaArchivo());

    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.queryByText(/^0 /)).toBeNull();
  });

  it("tiene título y descripción propios", () => {
    expect(metadata.title).toBe("Archivo de música");
    expect(String(metadata.description)).toMatch(/artistas, discos y canciones/i);
  });
});

describe("/archivo/artistas", () => {
  it("lista los artistas, con la letra elegida marcada y las demás como enlaces", async () => {
    const listar = vi.spyOn(datos, "listarArtistas").mockResolvedValue(pagina([ARTISTA]));

    render(await PaginaArtistas({ searchParams: buscaParams({ letra: "J" }) }));

    expect(listar).toHaveBeenCalledWith({ q: undefined, letra: "J", pagina: 1 });
    expect(screen.getByRole("link", { name: /Jorge Drexler/ })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    const letras = screen.getByRole("navigation", { name: "Por letra" });
    expect(within(letras).getByRole("link", { name: "J" })).toHaveAttribute("aria-current", "true");
    expect(within(letras).getByRole("link", { name: "K" })).toHaveAttribute("href", "/archivo/artistas?letra=K");
  });

  it("pasa la búsqueda y la página a la API y conserva la búsqueda al paginar", async () => {
    const listar = vi.spyOn(datos, "listarArtistas").mockResolvedValue(pagina([ARTISTA], { page: 2, pages: 3, count: 60 }));

    render(await PaginaArtistas({ searchParams: buscaParams({ q: "los", pagina: "2" }) }));

    expect(listar).toHaveBeenCalledWith({ q: "los", letra: undefined, pagina: 2 });
    expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute("href", "/archivo/artistas?q=los&pagina=3");
  });

  it.each([["abc"], ["-3"], ["0"], ["1.5"], [""]])("una página inválida (%s) es la primera, no un error", async (valor) => {
    const listar = vi.spyOn(datos, "listarArtistas").mockResolvedValue(pagina([ARTISTA]));

    render(await PaginaArtistas({ searchParams: buscaParams({ pagina: valor }) }));

    expect(listar.mock.calls[0][0]).toMatchObject({ pagina: 1 });
  });

  it("una letra que no es una letra se ignora", async () => {
    const listar = vi.spyOn(datos, "listarArtistas").mockResolvedValue(pagina([ARTISTA]));

    render(await PaginaArtistas({ searchParams: buscaParams({ letra: "<script>" }) }));

    expect(listar.mock.calls[0][0].letra).toBeUndefined();
  });

  it("sin resultados lo dice, y con la API caída avisa", async () => {
    vi.spyOn(datos, "listarArtistas").mockResolvedValueOnce(pagina([]));
    const { unmount } = render(await PaginaArtistas({ searchParams: buscaParams({ q: "zzz" }) }));
    expect(screen.getByText(/No encontramos artistas/)).toBeInTheDocument();
    unmount();

    vi.spyOn(datos, "listarArtistas").mockResolvedValueOnce(null);
    render(await PaginaArtistas({ searchParams: buscaParams({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar/);
  });
});

describe("/archivo/discos", () => {
  it("filtra por década, género y orden, y los selectores muestran lo elegido", async () => {
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(FILTROS);
    const listar = vi.spyOn(datos, "listarDiscos").mockResolvedValue(pagina([DISCO]));

    render(await PaginaDiscos({ searchParams: buscaParams({ decada: "1990", genero: "Folk", orden: "year" }) }));

    expect(listar).toHaveBeenCalledWith({ q: undefined, decada: 1990, genero: "Folk", orden: "year", pagina: 1 });
    expect(screen.getByRole("combobox", { name: "Década" })).toHaveValue("1990");
    expect(screen.getByRole("combobox", { name: "Género" })).toHaveValue("Folk");
    expect(screen.getByRole("link", { name: "Vaivén" })).toHaveAttribute("href", "/archivo/disco/12-vaiven");
  });

  it("una década o un orden inválidos se ignoran", async () => {
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(FILTROS);
    const listar = vi.spyOn(datos, "listarDiscos").mockResolvedValue(pagina([DISCO]));

    render(await PaginaDiscos({ searchParams: buscaParams({ decada: "abc", orden: "borrar" }) }));

    expect(listar.mock.calls[0][0]).toMatchObject({ decada: undefined, orden: undefined });
  });
});

describe("/archivo/canciones", () => {
  it("busca canciones y distingue las que se llaman igual por su artista y disco", async () => {
    const listar = vi.spyOn(datos, "listarCanciones").mockResolvedValue(pagina([CANCION, { ...CANCION, id: 6, artist: { id: 8, name: "Los Traidores" }, album: { id: 13, name: "Noches", year: 1988, genre: "Rock" } }]));

    render(await PaginaCanciones({ searchParams: buscaParams({ q: "luna negra", artista: "7" }) }));

    expect(listar).toHaveBeenCalledWith({ q: "luna negra", artista: 7, disco: undefined, decada: undefined, genero: undefined, pagina: 1 });
    const filas = within(screen.getByRole("main")).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Jorge Drexler");
    expect(filas[1]).toHaveTextContent("Los Traidores");
  });
});

describe("fichas", () => {
  it("el artista muestra sus discos y lleva a todas sus canciones", async () => {
    vi.spyOn(datos, "fichaDeArtista").mockResolvedValue({ id: 7, name: "Jorge Drexler", songs: 3, first_year: 1996, last_year: 2004, cover_art_url: "", picture_url: "", albums: [DISCO] });

    render(await FichaArtista({ params: ficha("7-jorge-drexler") }));

    expect(screen.getByRole("heading", { level: 1, name: "Jorge Drexler" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vaivén" })).toHaveAttribute("href", "/archivo/disco/12-vaiven");
    expect(screen.getByRole("link", { name: /todas sus canciones/i })).toHaveAttribute("href", "/archivo/canciones?artista=7");
  });

  it("la ficha del artista muestra su foto si la tiene, y si no, la inicial", async () => {
    const base = { id: 7, name: "Jorge Drexler", songs: 3, first_year: 1996, last_year: 2004, cover_art_url: "", albums: [DISCO] };
    vi.spyOn(datos, "fichaDeArtista").mockResolvedValueOnce({ ...base, picture_url: "https://cdn/d.jpg" });
    const { unmount } = render(await FichaArtista({ params: ficha("7-jorge-drexler") }));
    expect(screen.getByRole("img", { name: "Foto de Jorge Drexler" })).toHaveAttribute("src", "https://cdn/d.jpg");
    unmount();

    vi.spyOn(datos, "fichaDeArtista").mockResolvedValueOnce({ ...base, picture_url: "" });
    render(await FichaArtista({ params: ficha("7-jorge-drexler") }));
    expect(screen.queryByRole("img", { name: /Foto de/ })).toBeNull();
    expect(document.querySelector(".artista__inicial")).toHaveTextContent("J");
  });

  it("el disco muestra su portada, su artista y sus canciones con la duración", async () => {
    vi.spyOn(datos, "fichaDeDisco").mockResolvedValue({ ...DISCO, songs: [{ id: 5, title: "Luna negra", duration_seconds: 225 }, { id: 6, title: "Milonga", duration_seconds: null }] });

    render(await FichaDisco({ params: ficha("12-vaiven") }));

    expect(screen.getByRole("heading", { level: 1, name: "Vaivén" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Tapa de Vaivén/ })).toHaveAttribute("src", "https://img/c.jpg");
    expect(screen.getByRole("link", { name: "Jorge Drexler" })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(screen.getByRole("link", { name: "Luna negra" })).toHaveAttribute("href", "/archivo/cancion/5-luna-negra");
    expect(screen.getByText("3:45")).toBeInTheDocument();
  });

  it("el disco sin tapa no dibuja una imagen rota", async () => {
    vi.spyOn(datos, "fichaDeDisco").mockResolvedValue({ ...DISCO, cover_art_url: "", songs: [] });

    render(await FichaDisco({ params: ficha("12") }));

    expect(screen.queryByRole("img", { name: /Tapa de/ })).toBeNull();
  });

  it("la canción dice de qué artista y disco es, y en qué días anteriores fue la del día, con enlace", async () => {
    vi.spyOn(datos, "fichaDeCancion").mockResolvedValue({ ...CANCION, played_on: ["2026-10-02", "2026-09-20"] });
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(pagina([]));

    render(await FichaCancion({ params: ficha("5-luna-negra") }));

    expect(screen.getByRole("heading", { level: 1, name: "Luna negra" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jorge Drexler" })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(screen.getByRole("link", { name: /Vaivén/ })).toHaveAttribute("href", "/archivo/disco/12-vaiven");
    expect(screen.getByRole("link", { name: "2026-10-02" })).toHaveAttribute("href", "/anteriores/2026-10-02");
  });

  it("la canción lista las otras que se llaman igual (de otros artistas o discos), sin repetirse a sí misma", async () => {
    vi.spyOn(datos, "fichaDeCancion").mockResolvedValue({ ...CANCION, played_on: [] });
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(pagina([CANCION, { ...CANCION, id: 6, artist: { id: 8, name: "Los Traidores" }, album: { id: 13, name: "Noches", year: 1988, genre: "Rock" } }]));

    render(await FichaCancion({ params: ficha("5-luna-negra") }));

    const otras = screen.getByRole("region", { name: /mismo título/i });
    expect(within(otras).getAllByRole("listitem")).toHaveLength(1);
    expect(otras).toHaveTextContent("Los Traidores");
  });

  it.each([
    ["una dirección que no es un id", "abc"],
    ["un id que no existe", "999-nada"],
  ])("%s es un 404", async (_nombre, valor) => {
    vi.spyOn(datos, "fichaDeArtista").mockResolvedValue("no-encontrado");

    await expect(FichaArtista({ params: ficha(valor) })).rejects.toThrow();
  });

  it("si la API falla la ficha falla (no se guarda un aviso con 200 en la caché)", async () => {
    vi.spyOn(datos, "fichaDeArtista").mockResolvedValue(null);

    await expect(FichaArtista({ params: ficha("7-x") })).rejects.toThrow(/No se pudo cargar/);
  });

  it("el título de la canción para los buscadores dice el artista", async () => {
    vi.spyOn(datos, "fichaDeCancion").mockResolvedValue({ ...CANCION, played_on: [] });

    const meta = await metadataCancion({ params: ficha("5-luna-negra") });

    expect(String(meta.title)).toContain("Luna negra");
    expect(String(meta.title)).toContain("Jorge Drexler");
    expect(meta.alternates?.canonical).toBe("/archivo/cancion/5-luna-negra");
  });
});
