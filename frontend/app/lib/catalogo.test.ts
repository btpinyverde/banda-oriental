import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obtenerDiscos, porArtista, porDecada, porGenero, type DiscoDelCatalogo } from "./catalogo";

const disco = (artista: string, nombre: string, anio: number | null, genero = "", canciones = 10): DiscoDelCatalogo => ({
  artista,
  disco: nombre,
  anio,
  genero,
  canciones,
});

describe("obtenerDiscos", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/"));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const cancion = (id: number, artist: string, album: string, year: number | null, genre = "") => ({ id, title: `T${id}`, artist, album, year, genre });
  const responder = (cuerpo: unknown, estado = 200) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: estado < 300, status: estado, json: () => Promise.resolve(cuerpo) }));

  it("arma los discos juntando las canciones de cada uno, y cuenta cuántas tiene", async () => {
    responder({
      songs: [
        cancion(1, "Jorge Drexler", "Vaivén", 1996, "pop"),
        cancion(2, "Jorge Drexler", "Vaivén", 1996, "pop"),
        cancion(3, "Jorge Drexler", "Eco", 2004),
        cancion(4, "Rubén Rada", "Montevideo", 1990),
      ],
    });

    const discos = await obtenerDiscos();

    expect(discos).toHaveLength(3);
    expect(discos).toContainEqual({ artista: "Jorge Drexler", disco: "Vaivén", anio: 1996, genero: "pop", canciones: 2 });
  });

  it("pide la lista de canciones del catálogo y la deja en caché diez minutos", async () => {
    responder({ songs: [] });

    await obtenerDiscos();

    const [url, opciones] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example/api/songs/");
    expect(opciones.next.revalidate).toBe(600);
  });

  it("no espera a la API para siempre: el pedido tiene un tiempo máximo, así armar la página nunca cuelga el despliegue", async () => {
    responder({ songs: [] });

    await obtenerDiscos();

    const opciones = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it("si la API falla o no hay red devuelve null, para que la página lo explique", async () => {
    responder({}, 500);
    expect(await obtenerDiscos()).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    expect(await obtenerDiscos()).toBeNull();
  });
});

describe("porArtista", () => {
  it("ordena a los artistas por nombre (sin distinguir tildes ni mayúsculas) y a sus discos por año", () => {
    const grupos = porArtista([disco("Rubén Rada", "B", 1990), disco("Álvaro Pintos", "C", 2010), disco("Rubén Rada", "A", 1980)]);

    expect(grupos.map((g) => g.nombre)).toEqual(["Álvaro Pintos", "Rubén Rada"]);
    expect(grupos[1].discos.map((d) => d.disco)).toEqual(["A", "B"]);
  });

  it("cuenta discos y canciones de cada artista", () => {
    const [grupo] = porArtista([disco("X", "A", 1990, "", 8), disco("X", "B", 1991, "", 5)]);

    expect(grupo.cantidadDeDiscos).toBe(2);
    expect(grupo.cantidadDeCanciones).toBe(13);
  });
});

describe("porDecada", () => {
  it("agrupa por década, de la más nueva a la más vieja, y deja al final los discos sin año", () => {
    const grupos = porDecada([disco("A", "a", 1996), disco("B", "b", 2004), disco("C", "c", 1991), disco("D", "d", null)]);

    expect(grupos.map((g) => g.etiqueta)).toEqual(["Años 2000", "Años 1990", "Sin año"]);
    expect(grupos[1].discos).toHaveLength(2);
  });

  it("dentro de cada década va del más viejo al más nuevo", () => {
    const [grupo] = porDecada([disco("A", "tarde", 1999), disco("B", "temprano", 1991)]);

    expect(grupo.discos.map((d) => d.disco)).toEqual(["temprano", "tarde"]);
  });
});

describe("porGenero", () => {
  it("agrupa por género, del que tiene más discos al que tiene menos, y deja al final los discos sin género", () => {
    const grupos = porGenero([disco("A", "a", 1, "rock"), disco("B", "b", 1, "rock"), disco("C", "c", 1, "tango"), disco("D", "d", 1, "")]);

    expect(grupos.map((g) => g.etiqueta)).toEqual(["rock", "tango", "Sin género"]);
  });

  it("no distingue mayúsculas al agrupar y deja el género en minúscula", () => {
    const grupos = porGenero([disco("A", "a", 1, "Rock"), disco("B", "b", 1, "rock")]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].etiqueta).toBe("rock");
  });
});
