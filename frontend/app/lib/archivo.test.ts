import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esFechaValida, obtenerDia, obtenerDias } from "./archivo";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/"));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const simular = (...respuestas: unknown[]) => {
  const mock = vi.fn();
  respuestas.forEach((r) => mock.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", mock);
  return mock;
};
const respuesta = (cuerpo: unknown, estado = 200) => ({ ok: estado < 300, status: estado, json: () => Promise.resolve(cuerpo) });

describe("obtenerDias", () => {
  it("trae la lista de días vencidos del archivo, del más nuevo al más viejo, y la deja en caché diez minutos", async () => {
    const dias = [
      { date: "2026-10-03", song_title: "A las nueve", artist: "No Te Va Gustar" },
      { date: "2026-10-02", song_title: "Luna negra", artist: "Jorge Drexler" },
    ];
    const mock = simular(respuesta({ days: dias }));

    expect(await obtenerDias()).toEqual(dias);

    const [url, opciones] = mock.mock.calls[0];
    expect(url).toBe("https://api.example/api/archive/");
    expect(opciones.next.revalidate).toBe(600);
  });

  it("si la API falla devuelve null (la página lo explica) en vez de romper", async () => {
    simular(respuesta({ detail: "Error" }, 500));

    expect(await obtenerDias()).toBeNull();
  });

  it("si no hay conexión devuelve null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));

    expect(await obtenerDias()).toBeNull();
  });
});

describe("obtenerDia", () => {
  const dia = { date: "2026-10-02", song_title: "Luna negra", artist: "Jorge Drexler", album: "Vaivén", artist_instagram_handle: "drexler" };

  it("trae un día", async () => {
    const mock = simular(respuesta(dia));

    expect(await obtenerDia("2026-10-02")).toEqual(dia);
    expect(mock.mock.calls[0][0]).toBe("https://api.example/api/archive/2026-10-02/");
  });

  it("un día que no existe (404) es 'no encontrado', distinto de un fallo", async () => {
    simular(respuesta({ detail: "Día no encontrado." }, 404));

    expect(await obtenerDia("2026-01-01")).toBe("no-encontrado");
  });

  it("un fallo de la API o de la red es null, no 'no encontrado'", async () => {
    simular(respuesta({}, 500));
    expect(await obtenerDia("2026-10-02")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    expect(await obtenerDia("2026-10-02")).toBeNull();
  });

  it("no le pregunta a la API por algo que no es una fecha", async () => {
    const mock = simular(respuesta(dia));

    expect(await obtenerDia("../admin")).toBe("no-encontrado");
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("esFechaValida", () => {
  it.each(["2026-10-03", "2025-02-28"])("acepta %s", (f) => expect(esFechaValida(f)).toBe(true));
  it.each(["2026-13-01", "2026-02-30", "hoy", "2026-1-3", "", "2026-10-03/../x"])("rechaza %s", (f) => expect(esFechaValida(f)).toBe(false));
});
