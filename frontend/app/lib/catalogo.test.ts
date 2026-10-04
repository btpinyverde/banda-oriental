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

  const responder = (cuerpo: unknown, estado = 200) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: estado < 300, status: estado, json: () => Promise.resolve(cuerpo) }));

  it("trae los discos ya agrupados por el servidor (mucho más liviano que la lista de todas las canciones)", async () => {
    responder({
      albums: [
        { artist: "Jorge Drexler", album: "Vaivén", year: 1996, genre: "pop", songs: 12 },
        { artist: "Rubén Rada", album: "Montevideo", year: null, genre: "", songs: 9 },
      ],
    });

    const discos = await obtenerDiscos();

    expect(discos).toEqual([
      { artista: "Jorge Drexler", disco: "Vaivén", anio: 1996, genero: "pop", canciones: 12 },
      { artista: "Rubén Rada", disco: "Montevideo", anio: null, genero: "", canciones: 9 },
    ]);
    const [url, opciones] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example/api/albums/");
    expect(opciones.next.revalidate).toBe(600);
  });

  it("no espera a la API para siempre: el pedido tiene un tiempo máximo, así armar la página nunca cuelga el despliegue", async () => {
    responder({ albums: [] });

    await obtenerDiscos();

    const opciones = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it("si la API falla, no hay red o responde algo con otra forma, devuelve null para que la página lo explique", async () => {
    responder({}, 500);
    expect(await obtenerDiscos()).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    expect(await obtenerDiscos()).toBeNull();

    responder({});
    expect(await obtenerDiscos()).toBeNull();

    responder({ albums: "no es una lista" });
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
