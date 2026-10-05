import { describe, expect, it } from "vitest";
import type { RankingServidor } from "../juego/tipos";
import { datosDePosicion, leerParametrosPosicion, nombreDelArchivoPosicion, textoParaCompartirPosicion, urlDePosicion, type DatosPosicion } from "./posicion";

const DATOS: DatosPosicion = { periodo: "week", puesto: 3, puntos: 2450, partidas: 4, jugadores: 128, nombre: "Ana" };
const ranking = (extra: Partial<RankingServidor> = {}): RankingServidor => ({
  period: "day",
  from: "2026-10-05",
  to: "2026-10-05",
  entries: [],
  players: 40,
  me: { rank: 7, display_name: "Ana", score: 900, games: 1 },
  ...extra,
});

describe("urlDePosicion y leerParametrosPosicion", () => {
  it("el link de la imagen lleva todo y se lee de vuelta igual", () => {
    const url = urlDePosicion(DATOS);

    expect(url.startsWith("/compartir/posicion?")).toBe(true);
    expect(leerParametrosPosicion(new URL(`https://x.uy${url}`).searchParams)).toEqual(DATOS);
  });

  it("el nombre y el total de jugadores son opcionales", () => {
    const sin = { periodo: "all", puesto: 1, puntos: 10, partidas: 1 } as const;

    expect(leerParametrosPosicion(new URL(`https://x.uy${urlDePosicion(sin)}`).searchParams)).toEqual(sin);
  });

  it.each([
    ["período desconocido", "p=year&r=3&s=10&g=1"],
    ["sin puesto", "p=day&s=10&g=1"],
    ["puesto cero", "p=day&r=0&s=10&g=1"],
    ["puesto que no es número", "p=day&r=abc&s=10&g=1"],
    ["puesto gigante", "p=day&r=99999999&s=10&g=1"],
    ["puntos negativos", "p=day&r=3&s=-1&g=1"],
    ["sin partidas", "p=day&r=3&s=10"],
    ["más lugar en el ranking que jugadores", "p=day&r=9&s=10&g=1&j=3"],
  ])("rechaza %s", (_nombre, consulta) => {
    expect(leerParametrosPosicion(new URLSearchParams(consulta))).toBeNull();
  });

  it("el nombre se limpia: sin caracteres de control y de largo acotado", () => {
    const datos = leerParametrosPosicion(new URLSearchParams(`p=day&r=1&s=10&g=1&n=${encodeURIComponent("Ana\n\u0000" + "x".repeat(100))}`));

    expect(datos?.nombre).toBeDefined();
    expect(datos!.nombre!.length).toBeLessThanOrEqual(30);
    expect(datos!.nombre).not.toMatch(/[\u0000-\u001f]/);
  });

  it("un nombre vacío se descarta en vez de dibujar un hueco", () => {
    expect(leerParametrosPosicion(new URLSearchParams("p=day&r=1&s=10&g=1&n=%20%20"))?.nombre).toBeUndefined();
  });
});

describe("datosDePosicion", () => {
  it("toma el puesto, los puntos y el total del ranking que se está mirando", () => {
    expect(datosDePosicion(ranking())).toEqual({ periodo: "day", puesto: 7, puntos: 900, partidas: 1, jugadores: 40, nombre: "Ana" });
  });

  it("sin puesto propio no hay nada que compartir", () => {
    expect(datosDePosicion(ranking({ me: null }))).toBeNull();
  });

  it("si el servidor todavía no manda el total de jugadores, se comparte igual sin él", () => {
    const datos = datosDePosicion(ranking({ players: undefined }));

    expect(datos).not.toBeNull();
    expect(datos).not.toHaveProperty("jugadores");
  });
});

describe("textoParaCompartirPosicion", () => {
  it("dice el puesto, de cuántos y en qué escala, con el link", () => {
    const texto = textoParaCompartirPosicion(DATOS, "https://bandaoriental.xami.uy");

    expect(texto).toContain("puesto 3 de 128");
    expect(texto).toContain("esta semana");
    expect(texto).toContain("2.450");
    expect(texto).toContain("https://bandaoriental.xami.uy");
  });

  it.each([
    ["day", "hoy"],
    ["week", "esta semana"],
    ["month", "este mes"],
    ["all", "de siempre"],
  ] as const)("la escala %s se nombra '%s'", (periodo, esperado) => {
    expect(textoParaCompartirPosicion({ ...DATOS, periodo }, "https://x.uy")).toContain(esperado);
  });

  it("el primer puesto se presume", () => {
    const texto = textoParaCompartirPosicion({ ...DATOS, puesto: 1 }, "https://x.uy");

    expect(texto).toMatch(/primer puesto|número 1|1\b/i);
    expect(texto).toMatch(/Banda Oriental/);
  });

  it("sin el total de jugadores no dice 'de undefined'", () => {
    const { jugadores: _quitado, ...sin } = DATOS;

    expect(textoParaCompartirPosicion(sin, "https://x.uy")).not.toMatch(/undefined|NaN/);
  });
});

describe("nombreDelArchivoPosicion", () => {
  it("es un png con la escala y el puesto", () => {
    expect(nombreDelArchivoPosicion(DATOS)).toBe("banda-oriental-ranking-week-3.png");
  });
});
