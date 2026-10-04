import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearClienteHttp } from "./cliente-http";
import { ApiError } from "./tipos";

const ID = "11111111-2222-4333-8444-555555555555";

const respuesta = (cuerpo: unknown, estado = 200) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  json: () => Promise.resolve(cuerpo),
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/"));
afterEach(() => {
  vi.useRealTimers();
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

describe("estadoDelDia", () => {
  it("pide el estado con el identificador del dispositivo y sin caché", async () => {
    const estado = { finished: false, day: "2026-10-03" };
    const mock = simular(respuesta(estado));

    expect(await crearClienteHttp().estadoDelDia(ID)).toEqual(estado);

    const [url, opciones] = mock.mock.calls[0];
    expect(url).toBe("https://api.example/api/daily/");
    expect(opciones.headers["X-Device-Id"]).toBe(ID);
    expect(opciones.cache).toBe("no-store");
  });

  it("devuelve null cuando todavía no hay canción publicada (404)", async () => {
    simular(respuesta({ detail: "No hay canción publicada para hoy." }, 404));

    expect(await crearClienteHttp().estadoDelDia(ID)).toBeNull();
  });

  it("lanza ApiError con el mensaje del backend ante otro error", async () => {
    simular(respuesta({ detail: "Falla interna." }, 500));

    await expect(crearClienteHttp().estadoDelDia(ID)).rejects.toMatchObject({ name: "ApiError", status: 500, message: "Falla interna." });
  });
});

describe("enviarIntento", () => {
  it("manda el número de intento y la canción elegida", async () => {
    const resultado = { is_correct: false, attempt_number: 2, finished: false, attempts_remaining: 4, feedback: {} };
    const mock = simular(respuesta(resultado));

    expect(await crearClienteHttp().enviarIntento(ID, 2, 77)).toEqual(resultado);

    const [url, opciones] = mock.mock.calls[0];
    expect(url).toBe("https://api.example/api/daily/guess/");
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(opciones.body)).toEqual({ attempt_number: 2, song_id: 77 });
  });

  it("junta los mensajes de validación cuando el backend no manda `detail`", async () => {
    simular(respuesta({ device_id: "The X-Device-Id header is required." }, 400));

    await expect(crearClienteHttp().enviarIntento(ID, 1, 1)).rejects.toMatchObject({
      status: 400,
      message: "The X-Device-Id header is required.",
    });
  });

  it("usa un mensaje genérico si la respuesta de error no es JSON", async () => {
    simular({ ok: false, status: 502, json: () => Promise.reject(new Error("no json")) });

    await expect(crearClienteHttp().enviarIntento(ID, 1, 1)).rejects.toMatchObject({ status: 502, message: "Error inesperado." });
  });
});

describe("enviarPuntaje", () => {
  it("manda el nombre y los segundos totales", async () => {
    const mock = simular(respuesta({ score: 120, winning_attempt: 3, display_name: "brandon" }, 201));

    const resultado = await crearClienteHttp().enviarPuntaje(ID, "brandon", 42.5);

    expect(resultado.score).toBe(120);
    expect(String(mock.mock.calls[0][0])).toBe("https://api.example/api/daily/score/");
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({ display_name: "brandon", total_time_seconds: 42.5 });
  });
});

describe("listarCanciones", () => {
  it("devuelve la lista de canciones del catálogo", async () => {
    const canciones = [{ id: 1, title: "A las nueve", artist: "No Te Va Gustar", album: "El camino", year: 2004, genre: "Rock" }];
    const mock = simular(respuesta({ songs: canciones }));

    expect(await crearClienteHttp().listarCanciones()).toEqual(canciones);
    expect(mock.mock.calls[0][0]).toBe("https://api.example/api/songs/");
  });
});

describe("red caída o lenta", () => {
  it("convierte un fallo de red en ApiError con estado 0, que significa 'no sé si llegó'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await crearClienteHttp().estadoDelDia(ID).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it("espera hasta 60 segundos (un servidor dormido tarda en despertar) y recién ahí corta para poder reintentar", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, opciones: RequestInit) =>
        new Promise((_resolver, rechazar) => {
          opciones.signal?.addEventListener("abort", () => rechazar(new DOMException("abortado", "AbortError")));
        }),
      ),
    );

    let terminado = false;
    const pendiente = crearClienteHttp()
      .estadoDelDia(ID)
      .catch((e) => e)
      .finally(() => (terminado = true));
    await vi.advanceTimersByTimeAsync(30000);
    // A los 30 segundos todavía espera: el servidor gratuito puede tardar más de eso en arrancar.
    expect(terminado).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);

    const error = await pendiente;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/tardó/);
  });
});
