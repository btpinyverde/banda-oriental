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

// La barra de filtros navega con el router de Next, que en las pruebas no está montado; `notFound` y lo demás siguen siendo los reales.
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const pagina = <T,>(results: T[], extra: Partial<Pagina<T>> = {}): Pagina<T> => ({ count: results.length, page: 1, pages: 1, results, ...extra });
const ARTISTA: ArtistaFila = { id: 7, name: "Jorge Drexler", albums: 2, songs: 3, first_year: 1996, last_year: 2004, cover_art_url: "", picture_url: "" };
const DISCO: DiscoFila = { id: 12, name: "Vaivén", artist: { id: 7, name: "Jorge Drexler" }, year: 1996, genre: "Folk", release_type: "album", songs: 2, cover_art_url: "https://img/c.jpg" };
const CANCION: CancionFila = { id: 5, title: "Luna negra", duration_seconds: 225, artist: { id: 7, name: "Jorge Drexler" }, album: { id: 12, name: "Vaivén", year: 1996, genre: "Folk", cover_art_url: "https://img/c.jpg" }, played_on: null };
const FILTROS = { decades: [{ decade: 1990, albums: 3 }, { decade: 2000, albums: 5 }], genres: [{ genre: "Folk", albums: 2 }, { genre: "Rock", albums: 4 }], years: { min: 1990, max: 2009 } };
const buscaParams = (p: Record<string, string>) => Promise.resolve(p);
const ficha = (valor: string) => Promise.resolve({ ficha: valor });

describe("/archivo (el explorador de canciones)", () => {
  const preparar = (total = 124) => {
    const canciones = vi.spyOn(datos, "listarCanciones").mockImplementation(async (f) =>
      f.porPagina === 1 ? pagina([CANCION], { count: 17900 }) : pagina([CANCION, { ...CANCION, id: 6, title: "Otra" }], { count: total, pages: 7 }),
    );
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(FILTROS);
    return canciones;
  };
  const buscar = (p: Record<string, string> = {}) => PaginaArchivo({ searchParams: buscaParams(p) });

  it("abre con el título grande, la bajada con el total real y el collage", async () => {
    preparar();

    render(await buscar());

    expect(screen.getByRole("heading", { level: 1, name: /Toda la música uruguaya en un solo lugar/ })).toBeInTheDocument();
    expect(screen.getByText(/Más de 17\.900 canciones de todas las épocas/)).toBeInTheDocument();
    expect(screen.getByText("Archivo de canciones")).toBeInTheDocument();
  });

  it("tiene la barra de búsqueda, los chips de género y el conteo de lo encontrado", async () => {
    preparar(124);

    render(await buscar());

    expect(screen.getByRole("searchbox", { name: "Buscar en el archivo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Todas" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Rock" })).toHaveAttribute("href", "/archivo?genero=Rock");
    expect(screen.getByText("124 canciones encontradas")).toBeInTheDocument();
  });

  it("muestra las canciones como tarjetas con su tapa, de a 18, y pide a la API lo que el visitante eligió", async () => {
    const canciones = preparar();

    render(await buscar({ q: "luna", decada: "1990", genero: "Rock", orden: "newest", pagina: "2" }));

    expect(canciones).toHaveBeenCalledWith({ q: "luna", decada: 1990, genero: "Rock", orden: "newest", pagina: 2, porPagina: 18 });
    const lista = screen.getByRole("list", { name: "Canciones" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lista).getByRole("link", { name: "Luna negra" })).toHaveAttribute("href", "/archivo/cancion/5-luna-negra");
    expect(within(lista).getAllByRole("img", { name: /Tapa de Vaivén/ })).toHaveLength(2);
  });

  it("la paginación lleva números y conserva los filtros", async () => {
    preparar();

    render(await buscar({ genero: "Rock", q: "luna" }));

    const paginas = screen.getByRole("navigation", { name: "Páginas" });
    expect(within(paginas).getByRole("link", { name: "Página 2" }).getAttribute("href")).toContain("pagina=2");
    expect(within(paginas).getByRole("link", { name: "Página 2" }).getAttribute("href")).toContain("genero=Rock");
  });

  it("se puede cambiar entre tarjetas y lista, y la vista elegida queda marcada", async () => {
    preparar();
    const { unmount } = render(await buscar());
    expect(screen.getByRole("link", { name: "Ver como tarjetas" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Ver como lista" })).toHaveAttribute("href", "/archivo?vista=lista");
    unmount();

    render(await buscar({ vista: "lista", genero: "Rock" }));
    expect(screen.getByRole("link", { name: "Ver como lista" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Ver como tarjetas" })).toHaveAttribute("href", "/archivo?genero=Rock");
    expect(document.querySelector(".archivo-lista")).not.toBeNull();
  });

  it.each([
    ["pagina", "abc"],
    ["pagina", "-2"],
    ["decada", "abc"],
    ["orden", "borrar"],
  ])("un %s inválido (%s) se ignora: es la lista normal, no un error", async (clave, valor) => {
    const canciones = preparar();

    render(await buscar({ [clave]: valor }));

    const pedido = canciones.mock.calls.find(([f]) => f.porPagina === 18)![0];
    expect([pedido.pagina, pedido.decada, pedido.orden]).toEqual([1, undefined, undefined]);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("sin resultados lo dice y ofrece ver todo", async () => {
    vi.spyOn(datos, "listarCanciones").mockImplementation(async (f) => (f.porPagina === 1 ? pagina([CANCION], { count: 17900 }) : pagina([])));
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(FILTROS);

    render(await buscar({ q: "zzzz" }));

    expect(screen.getByText(/No encontramos canciones con ese criterio/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver todas las canciones/ })).toHaveAttribute("href", "/archivo");
  });

  it("si la API no responde la página sale igual, con el aviso, sin ceros inventados", async () => {
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(null);
    vi.spyOn(datos, "filtrosDelArchivo").mockResolvedValue(null);

    render(await buscar());

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar/);
    expect(screen.queryByText(/^0 canciones/)).toBeNull();
  });

  it("deja explorar por artistas y por discos, y ver los juegos anteriores", async () => {
    preparar();

    render(await buscar());

    expect(screen.getByRole("link", { name: "Artistas" })).toHaveAttribute("href", "/archivo/artistas");
    expect(screen.getByRole("link", { name: "Discos" })).toHaveAttribute("href", "/archivo/discos");
    expect(screen.getByRole("link", { name: /juegos anteriores/i })).toHaveAttribute("href", "/anteriores");
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
    const listar = vi.spyOn(datos, "listarCanciones").mockResolvedValue(pagina([CANCION, { ...CANCION, id: 6, artist: { id: 8, name: "Los Traidores" }, album: { id: 13, name: "Noches", year: 1988, genre: "Rock", cover_art_url: "" } }]));

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
    vi.spyOn(datos, "listarCanciones").mockResolvedValue(pagina([CANCION, { ...CANCION, id: 6, artist: { id: 8, name: "Los Traidores" }, album: { id: 13, name: "Noches", year: 1988, genre: "Rock", cover_art_url: "" } }]));

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
