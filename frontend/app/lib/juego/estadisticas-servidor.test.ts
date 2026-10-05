import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cambiarNombre, pedirDestacados, pedirEstadisticas, pedirGlobales, pedirRanking } from "./estadisticas-servidor";
import { ApiError } from "./tipos";
import { guardarSesion, leerSesion } from "../cuenta/sesion";

const ID = "11111111-2222-4333-8444-555555555555";

const respuesta = (cuerpo: unknown, estado = 200) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  json: () => Promise.resolve(cuerpo),
});

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function simular(...respuestas: unknown[]) {
  const mock = vi.fn();
  respuestas.forEach((r) => mock.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const ESTADISTICAS = {
  public_name: "Ana",
  played: 3,
  won: 2,
  win_percentage: 67,
  current_streak: 2,
  max_streak: 2,
  total_score: 1700,
  average_attempts: 2.5,
  distribution: [0, 1, 1, 0, 0, 0],
  last_played_day: "2026-10-03",
};

describe("pedirEstadisticas", () => {
  it("pide las estadísticas del dispositivo, sin caché, y devuelve lo que calculó el servidor", async () => {
    const mock = simular(respuesta(ESTADISTICAS));

    expect(await pedirEstadisticas(ID)).toEqual(ESTADISTICAS);

    const [url, opciones] = mock.mock.calls[0];
    expect(url).toBe("https://api.example/api/stats/");
    expect(opciones.headers["X-Device-Id"]).toBe(ID);
    expect(opciones.cache).toBe("no-store");
    expect(opciones.method ?? "GET").toBe("GET");
  });

  it("con sesión manda el token, para que sean las estadísticas de la cuenta", async () => {
    guardarSesion({ token: "token-de-ana", email: "ana@example.com" });
    const mock = simular(respuesta(ESTADISTICAS));

    await pedirEstadisticas(ID);

    expect(mock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-de-ana");
  });

  it("si la sesión venció (401) la borra y repite como anónimo", async () => {
    guardarSesion({ token: "vencido", email: "ana@example.com" });
    const mock = simular(respuesta({ detail: "Sesión inválida." }, 401), respuesta(ESTADISTICAS));

    expect(await pedirEstadisticas(ID)).toEqual(ESTADISTICAS);

    expect(leerSesion()).toBeNull();
    expect(mock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it("lanza ApiError con el mensaje del servidor si falla", async () => {
    simular(respuesta({ detail: "Falla interna." }, 500));

    await expect(pedirEstadisticas(ID)).rejects.toMatchObject({ name: "ApiError", status: 500, message: "Falla interna." });
  });
});

describe("pedirRanking", () => {
  const RANKING = {
    period: "week",
    from: "2026-10-05",
    to: "2026-10-11",
    entries: [{ rank: 1, display_name: "Ana", score: 1850, games: 2 }],
    me: null,
  };

  it("pide el ranking del período indicado", async () => {
    const mock = simular(respuesta(RANKING));

    expect(await pedirRanking("week", ID)).toEqual(RANKING);

    expect(mock.mock.calls[0][0]).toBe("https://api.example/api/leaderboard/?period=week");
    expect(mock.mock.calls[0][1].headers["X-Device-Id"]).toBe(ID);
  });

  it("sin identificador de dispositivo no manda el encabezado (y no hay 'me')", async () => {
    const mock = simular(respuesta(RANKING));

    await pedirRanking("all");

    expect(mock.mock.calls[0][1].headers["X-Device-Id"]).toBeUndefined();
  });

  it("con sesión manda el token para que el servidor devuelva el puesto de la cuenta", async () => {
    guardarSesion({ token: "token-de-ana", email: "ana@example.com" });
    const mock = simular(respuesta(RANKING));

    await pedirRanking("day", ID);

    expect(mock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-de-ana");
  });

  it("falla con ApiError, y también si no hay conexión", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));

    await expect(pedirRanking("day", ID)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("cambiarNombre", () => {
  it("manda el nombre nuevo con un PUT, con el dispositivo, y devuelve las estadísticas con el nombre ya cambiado", async () => {
    const mock = simular(respuesta({ ...ESTADISTICAS, public_name: "Anita" }));

    const nuevas = await cambiarNombre(ID, "Anita");

    expect(nuevas.public_name).toBe("Anita");
    const [url, opciones] = mock.mock.calls[0];
    expect(url).toBe("https://api.example/api/stats/name/");
    expect(opciones.method).toBe("PUT");
    expect(opciones.headers["X-Device-Id"]).toBe(ID);
    expect(opciones.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opciones.body)).toEqual({ public_name: "Anita" });
  });

  it("con sesión cambia el nombre de la cuenta", async () => {
    guardarSesion({ token: "token-de-ana", email: "ana@example.com" });
    const mock = simular(respuesta(ESTADISTICAS));

    await cambiarNombre(ID, "Anita");

    expect(mock.mock.calls[0][1].headers.Authorization).toBe("Bearer token-de-ana");
  });

  it("si la sesión venció (401) no repite el pedido como anónimo: cambiaría el nombre del dispositivo y no el de la cuenta", async () => {
    guardarSesion({ token: "vencido", email: "ana@example.com" });
    const mock = simular(respuesta({ detail: "Sesión inválida." }, 401), respuesta(ESTADISTICAS));

    await expect(cambiarNombre(ID, "Anita")).rejects.toMatchObject({ name: "ApiError", status: 401 });

    expect(mock).toHaveBeenCalledTimes(1);
    expect(leerSesion()).toBeNull();
  });

  it("si el servidor lo rechaza lanza ApiError con su mensaje y su código (por ejemplo, tenés que esperar)", async () => {
    simular(respuesta({ detail: "Podés cambiar tu nombre una vez cada 7 días.", code: "name_change_too_soon" }, 400));

    await expect(cambiarNombre(ID, "Anita")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      codigo: "name_change_too_soon",
      message: "Podés cambiar tu nombre una vez cada 7 días.",
    });
  });
});

describe("pedirDestacados y pedirGlobales", () => {
  it("piden las listas laterales y las cifras globales sin guardarlas en caché", async () => {
    const mock = simular(respuesta({ streaks: [{ display_name: "Ana", value: 5 }], songs: [] }), respuesta({ players: 10, games: 40, days: 3 }));

    expect((await pedirDestacados()).streaks[0]).toEqual({ display_name: "Ana", value: 5 });
    expect(await pedirGlobales()).toEqual({ players: 10, games: 40, days: 3 });

    expect(String(mock.mock.calls[0][0])).toBe("https://api.example/api/leaderboard/highlights/");
    expect(String(mock.mock.calls[1][0])).toBe("https://api.example/api/stats/global/");
    expect(mock.mock.calls[0][1].cache).toBe("no-store");
  });

  it("si la API responde con error, lanzan (la página decide qué hacer)", async () => {
    simular(respuesta({}, 500), respuesta({}, 500));

    await expect(pedirDestacados()).rejects.toThrow();
    await expect(pedirGlobales()).rejects.toThrow();
  });
});

