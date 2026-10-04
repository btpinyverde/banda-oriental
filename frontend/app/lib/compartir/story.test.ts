import { describe, expect, it } from "vitest";
import type { Partida } from "../juego/historial";
import type { Feedback } from "../juego/tipos";
import { codificarCuadricula, datosDePartida, leerParametros, puedeRevelar, textoParaCompartir, urlDeStory } from "./story";

const f = (year: Feedback["year"], genre: Feedback["genre"], artist: Feedback["artist"], album: Feedback["album"]): Feedback => ({
  year,
  genre,
  artist,
  album,
});

describe("codificarCuadricula", () => {
  it("escribe una letra por celda (a acierto, c cerca, e error, d sin datos) y separa los intentos con punto", () => {
    const filas = [f("newer", "same", "different", "unknown"), f("exact", "same", "same", "same")];

    expect(codificarCuadricula(filas)).toBe("caed.aaaa");
  });

  it("devuelve texto vacío si no hay intentos", () => {
    expect(codificarCuadricula([])).toBe("");
  });
});

describe("leerParametros", () => {
  const parametros = (texto: string) => new URLSearchParams(texto);

  it("lee la versión oculta: cuadrícula, intentos y número del juego", () => {
    expect(leerParametros(parametros("g=caee.aaca.aaaa&i=3&n=138"))).toEqual({
      filas: ["caee", "aaca", "aaaa"],
      intentos: 3,
      numero: 138,
    });
  });

  it("acepta una partida perdida con i=x", () => {
    expect(leerParametros(parametros("g=caee.aeee&i=x"))).toMatchObject({ intentos: null });
  });

  it("acepta la fecha en lugar del número del juego", () => {
    expect(leerParametros(parametros("g=aaaa&i=1&d=2026-10-03"))).toMatchObject({ dia: "2026-10-03" });
  });

  it("lee la versión revelada con título, artista, disco, año y usuario de Instagram", () => {
    const datos = leerParametros(parametros("g=aaaa&i=1&n=135&t=A+las+nueve&a=No+Te+Va+Gustar&b=El+camino+m%C3%A1s+largo&y=2004&ig=notevagustaroficial"));

    expect(datos).toMatchObject({
      cancion: { titulo: "A las nueve", artista: "No Te Va Gustar", disco: "El camino más largo", anio: 2004, instagram: "notevagustaroficial" },
    });
  });

  it("rechaza lo que no sirve: sin cuadrícula, letras raras, más de 6 intentos o filas de otro largo", () => {
    for (const malo of ["i=3", "g=zzzz&i=3", "g=aaaa.aaaa.aaaa.aaaa.aaaa.aaaa.aaaa&i=3", "g=aaa&i=3", "g=aaaa&i=9", "g=aaaa&i=0"]) {
      expect(leerParametros(parametros(malo))).toBeNull();
    }
  });

  it("recorta los textos largos y descarta los usuarios de Instagram inválidos, en vez de usarlos tal cual", () => {
    const largo = "x".repeat(200);
    const datos = leerParametros(parametros(`g=aaaa&i=1&t=${largo}&a=Artista&b=Disco&ig=<script>`));

    expect(datos?.cancion?.titulo.length).toBeLessThanOrEqual(60);
    expect(datos?.cancion?.instagram).toBeUndefined();
  });

  it("no acepta una canción a medias: sin título o sin artista queda la versión oculta", () => {
    expect(leerParametros(parametros("g=aaaa&i=1&t=Solo+titulo"))?.cancion).toBeUndefined();
  });

  it("ignora un número de juego absurdo", () => {
    expect(leerParametros(parametros("g=aaaa&i=1&n=99999999"))?.numero).toBeUndefined();
  });
});

describe("urlDeStory", () => {
  it("arma el link de la imagen y se puede volver a leer igual", () => {
    const datos = { filas: ["caee", "aaaa"], intentos: 2, numero: 138 };

    const url = urlDeStory(datos);

    expect(url.startsWith("/compartir/story?")).toBe(true);
    expect(leerParametros(new URL(url, "https://x.test").searchParams)).toEqual(datos);
  });

  it("lleva un número de versión del diseño, para que un cambio de diseño no se quede con la imagen vieja en caché", () => {
    expect(urlDeStory({ filas: ["aaaa"], intentos: 1 })).toMatch(/[?&]v=\d+/);
  });

  it("incluye la canción solo si se pide revelarla", () => {
    const datos = { filas: ["aaaa"], intentos: 1, numero: 135, cancion: { titulo: "A las nueve", artista: "No Te Va Gustar", disco: "El camino más largo" } };

    expect(urlDeStory(datos)).toContain("t=A+las+nueve");
    expect(urlDeStory({ ...datos, cancion: undefined })).not.toContain("t=");
  });
});

describe("puedeRevelar", () => {
  it("solo se puede mostrar la canción cuando el día ya pasó", () => {
    expect(puedeRevelar("2026-10-02", "2026-10-03")).toBe(true);
    expect(puedeRevelar("2026-10-03", "2026-10-03")).toBe(false);
    expect(puedeRevelar("2026-10-04", "2026-10-03")).toBe(false);
  });
});

describe("textoParaCompartir", () => {
  it("acompaña la imagen con el número, el resultado y el link", () => {
    expect(textoParaCompartir({ numero: 138, intentos: 3 }, "https://bandaoriental.xami.uy")).toBe(
      "Banda Oriental #138 · 3/6\nhttps://bandaoriental.xami.uy",
    );
  });

  it("para una partida perdida pone X", () => {
    expect(textoParaCompartir({ numero: 138, intentos: null }, "https://bandaoriental.xami.uy")).toBe(
      "Banda Oriental #138 · X/6\nhttps://bandaoriental.xami.uy",
    );
  });

  it("sin número del juego usa solo el nombre", () => {
    expect(textoParaCompartir({ intentos: 2 }, "https://bandaoriental.xami.uy")).toBe("Banda Oriental · 2/6\nhttps://bandaoriental.xami.uy");
  });
});

describe("datosDePartida", () => {
  const feedback = [f("newer", "same", "different", "different"), f("exact", "same", "same", "same")];
  const partida = (extra: Partial<Partida> = {}): Partida => ({
    dia: "2026-10-03",
    numero: 138,
    ganada: true,
    intentos: 2,
    cancion: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
    feedback,
    ...extra,
  });

  it("arma los datos de la versión oculta, sin la canción", () => {
    expect(datosDePartida(partida(), false)).toEqual({ filas: ["caee", "aaaa"], intentos: 2, numero: 138, dia: "2026-10-03" });
  });

  it("en la versión revelada suma el título, el artista y el disco", () => {
    expect(datosDePartida(partida(), true)?.cancion).toEqual({ titulo: "A las nueve", artista: "No Te Va Gustar", disco: "El camino más largo" });
  });

  it("una partida perdida va sin número de intentos", () => {
    expect(datosDePartida(partida({ ganada: false, intentos: 6 }), false)?.intentos).toBeNull();
  });

  it("si no se sabe en cuántos intentos salió, usa la cantidad de filas de colores", () => {
    expect(datosDePartida(partida({ intentos: null }), false)?.intentos).toBe(2);
  });

  it("devuelve undefined si no se guardaron los colores de los intentos", () => {
    expect(datosDePartida(partida({ feedback: undefined }), false)).toBeUndefined();
    expect(datosDePartida(partida({ feedback: [] }), false)).toBeUndefined();
  });
});
