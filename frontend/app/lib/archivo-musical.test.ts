import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buscarEnElArchivo, fichaDeArtista, filtrosDelArchivo, idDeFicha, listarArtistas, listarCanciones, listarDiscos, rutaDeArtista, rutaDeCancion, rutaDeDisco, slug } from "./archivo-musical";

const ARTISTA = { id: 7, name: "Jorge Drexler", albums: 2, songs: 3, first_year: 1996, last_year: 2004, cover_art_url: "", picture_url: "" };
const respuesta = (cuerpo: unknown, estado = 200) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/");
  fetchMock = vi.fn().mockResolvedValue(respuesta({ count: 1, page: 1, pages: 1, results: [ARTISTA] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const urlPedida = () => new URL(String(fetchMock.mock.calls.at(-1)![0]));

describe("slug y rutas de las fichas", () => {
  it("el slug es de la dirección: minúsculas, sin tildes ni signos", () => {
    expect(slug("Jorge Drexler")).toBe("jorge-drexler");
    expect(slug("Niña Ñandú — ¡En vivo!")).toBe("nina-nandu-en-vivo");
    expect(slug("###")).toBe("");
  });

  it("la dirección de cada ficha lleva el id y el nombre", () => {
    expect(rutaDeArtista({ id: 7, name: "Jorge Drexler" })).toBe("/archivo/artista/7-jorge-drexler");
    expect(rutaDeDisco({ id: 12, name: "Vaivén" })).toBe("/archivo/disco/12-vaiven");
    expect(rutaDeCancion({ id: 99, title: "Luna negra" })).toBe("/archivo/cancion/99-luna-negra");
  });

  it("sin nombre aprovechable la dirección es solo el id", () => {
    expect(rutaDeArtista({ id: 7, name: "###" })).toBe("/archivo/artista/7");
  });

  it("del tramo de la dirección se saca el id y nada más (lo demás de la dirección no se manda a la API)", () => {
    expect(idDeFicha("7-jorge-drexler")).toBe(7);
    expect(idDeFicha("7")).toBe(7);
    for (const malo of ["", "abc", "-5", "0", "7abc", "1e3", "../1", "99999999999999999999"]) expect(idDeFicha(malo), malo).toBeNull();
  });
});

describe("pedidos a la API del archivo", () => {
  it("la lista de artistas manda solo lo que se pidió, bien escapado", async () => {
    const lista = await listarArtistas({ q: "los traidores & más", letra: "L", pagina: 2 });

    const url = urlPedida();
    expect(url.pathname).toBe("/api/catalog/artists/");
    expect(url.searchParams.get("q")).toBe("los traidores & más");
    expect(url.searchParams.get("letter")).toBe("L");
    expect(url.searchParams.get("page")).toBe("2");
    expect(lista?.results[0].name).toBe("Jorge Drexler");
  });

  it("los artistas se pueden pedir por cantidad de canciones", async () => {
    await listarArtistas({ orden: "songs" });

    expect(urlPedida().searchParams.get("sort")).toBe("songs");
  });

  it("el tamaño de página se puede pedir", async () => {
    await listarArtistas({ porPagina: 50 });

    expect(urlPedida().searchParams.get("page_size")).toBe("50");
  });

  it("no manda parámetros vacíos", async () => {
    await listarArtistas({});

    expect([...urlPedida().searchParams.keys()]).toEqual([]);
  });

  it("la lista de discos filtra por década, género y orden", async () => {
    await listarDiscos({ decada: 1990, genero: "Folk", orden: "year", pagina: 1 });

    const params = urlPedida().searchParams;
    expect(urlPedida().pathname).toBe("/api/catalog/albums/");
    expect(params.get("decade")).toBe("1990");
    expect(params.get("genre")).toBe("Folk");
    expect(params.get("sort")).toBe("year");
  });

  it("la lista de canciones filtra por artista y disco", async () => {
    await listarCanciones({ q: "luna", artista: 7, disco: 12 });

    const params = urlPedida().searchParams;
    expect(urlPedida().pathname).toBe("/api/catalog/songs/");
    expect([params.get("q"), params.get("artist"), params.get("album")]).toEqual(["luna", "7", "12"]);
  });

  it("las listas se guardan en la caché de Next unos minutos y no esperan a la API para siempre", async () => {
    await listarArtistas({});

    const opciones = fetchMock.mock.calls[0][1];
    expect(opciones.next.revalidate).toBeGreaterThan(0);
    expect(opciones.signal).toBeDefined();
  });

  it("una ficha que no existe es 'no-encontrado'; si la API falla, null", async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ detail: "no" }, 404));
    expect(await fichaDeArtista(999)).toBe("no-encontrado");

    fetchMock.mockResolvedValueOnce(respuesta({}, 500));
    expect(await fichaDeArtista(7)).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("sin red"));
    expect(await fichaDeArtista(7)).toBeNull();
  });

  it("una respuesta con otra forma no se acepta", async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ lo: "que sea" }));

    expect(await listarArtistas({})).toBeNull();
  });

  it("los filtros (décadas y géneros) vienen de la API", async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ decades: [{ decade: 1990, albums: 3 }], genres: [{ genre: "Folk", albums: 2 }], years: { min: 1990, max: 1999 } }));

    const filtros = await filtrosDelArchivo();

    expect(urlPedida().pathname).toBe("/api/catalog/filters/");
    expect(filtros?.decades[0].decade).toBe(1990);
  });
});

describe("buscarEnElArchivo (desde el navegador, mientras se escribe)", () => {
  it("pide la búsqueda general sin caché y con el límite pedido", async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ q: "luna", artists: { results: [], total: 0 }, albums: { results: [], total: 0 }, songs: { results: [], total: 0 } }));

    await buscarEnElArchivo("luna", { limite: 4 });

    const url = urlPedida();
    expect(url.pathname).toBe("/api/catalog/search/");
    expect(url.searchParams.get("q")).toBe("luna");
    expect(url.searchParams.get("limit")).toBe("4");
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });

  it("se puede cancelar y deja pasar el cancelado sin tratarlo como un error de la API", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("cancelado", "AbortError"));

    await expect(buscarEnElArchivo("luna", { senial: new AbortController().signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("si la API responde con error, lanza para que la pantalla avise", async () => {
    fetchMock.mockResolvedValueOnce(respuesta({ detail: "mal" }, 400));

    await expect(buscarEnElArchivo("luna")).rejects.toThrow();
  });
});
