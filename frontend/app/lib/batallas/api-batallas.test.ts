import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idDeDispositivo } from "../juego/dispositivo";
import { borrarSesion, guardarSesion } from "../cuenta/sesion";
import { crearApiBatallas, guardarHostToken, leerHostToken } from "./api-batallas";

const respuesta = (cuerpo: unknown, estado = 200) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  json: () => Promise.resolve(cuerpo),
});

function simular(...respuestas: unknown[]) {
  const mock = vi.fn();
  respuestas.forEach((r) => mock.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const ultima = (mock: ReturnType<typeof vi.fn>) => {
  const [url, opciones] = mock.mock.calls.at(-1)!;
  return { url: url as string, opciones, cuerpo: opciones.body ? JSON.parse(opciones.body) : undefined };
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("crearApiBatallas", () => {
  it("crear manda solo los campos que se pasaron y el identificador del dispositivo", async () => {
    const mock = simular(respuesta({ code: "ABC234", host_token: "t", round_count: 5, round_seconds: 20, title: "" }, 201));

    const sala = await crearApiBatallas().crear({ rondas: 5 });

    const { url, opciones, cuerpo } = ultima(mock);
    expect(url).toBe("https://api.example/api/battles/");
    expect(opciones.method).toBe("POST");
    expect(opciones.headers["X-Device-Id"]).toBe(idDeDispositivo());
    expect(cuerpo).toEqual({ round_count: 5 });
    expect(sala.code).toBe("ABC234");
  });

  it("manda los modos de audio y de entrada si se pasan", async () => {
    const mock = simular(respuesta({ code: "ABC234", host_token: "t" }, 201));
    await crearApiBatallas().crear({ audioMode: "host", joinMode: "approval" });
    expect(ultima(mock).cuerpo).toEqual({ audio_mode: "host", join_mode: "approval" });
  });

  it("crear manda cómo se eligen las canciones: filtros o lista", async () => {
    const mock = simular(respuesta({ code: "ABC234", host_token: "t" }, 201), respuesta({ code: "ABC234", host_token: "t" }, 201));
    const api = crearApiBatallas();
    const filtros = { include: { genres: ["Rock"] }, exclude: { songs: [3] } };

    await api.crear({ filtros });
    expect(ultima(mock).cuerpo).toEqual({ filters: filtros });

    const lista = [{ song_id: 5, source: "youtube" as const, youtube_id: "dQw4w9WgXcQ", start_seconds: 12 }];
    await api.crear({ modoDeCanciones: "list", lista });
    expect(ultima(mock).cuerpo).toEqual({ songs_mode: "list", playlist: lista });
  });

  it("pool cuenta las canciones de un segmento", async () => {
    const mock = simular(respuesta({ count: 42 }));
    const n = await crearApiBatallas().pool({ include: { year_from: 2000 }, exclude: {} });
    expect(ultima(mock).url).toBe("https://api.example/api/battles/pool/");
    expect(ultima(mock).cuerpo).toEqual({ filters: { include: { year_from: 2000 }, exclude: {} } });
    expect(n).toBe(42);
  });

  it("youtube lee un enlace y devuelve el video, el título y las canciones posibles", async () => {
    const mock = simular(respuesta({ youtube_id: "dQw4w9WgXcQ", title: "T", author: "A", suggestions: [{ id: 1, title: "Zafar" }] }));
    const r = await crearApiBatallas().youtube("https://youtu.be/dQw4w9WgXcQ");
    expect(ultima(mock).url).toBe("https://api.example/api/battles/youtube/");
    expect(ultima(mock).cuerpo).toEqual({ url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(r.suggestions[0].title).toBe("Zafar");
  });

  it("revisar acepta o rechaza a una persona con la clave del organizador", async () => {
    const mock = simular(respuesta({ ok: true }));
    await crearApiBatallas().revisar("abc234", 7, true, "secreto");
    expect(ultima(mock).url).toBe("https://api.example/api/battles/ABC234/review/");
    expect(ultima(mock).cuerpo).toEqual({ player_id: 7, accept: true });
    expect(ultima(mock).opciones.headers["X-Host-Token"]).toBe("secreto");
  });

  it("manda también los segundos y el título si se pasan", async () => {
    const mock = simular(respuesta({ code: "ABC234", host_token: "t" }, 201));
    await crearApiBatallas().crear({ rondas: 8, segundos: 15, titulo: "Cumple de Ana" });
    expect(ultima(mock).cuerpo).toEqual({ round_count: 8, round_seconds: 15, title: "Cumple de Ana" });
  });

  it("unirse manda el nombre, y la clave del organizador si la hay", async () => {
    const mock = simular(respuesta({ player: { name: "Ana" } }, 201));
    await crearApiBatallas().unirse("abc234", "Ana");
    expect(ultima(mock).url).toBe("https://api.example/api/battles/ABC234/join/");
    expect(ultima(mock).cuerpo).toEqual({ display_name: "Ana" });
  });

  it("estado agrega since solo si se pasa y manda la clave del organizador", async () => {
    const mock = simular(respuesta({ changed: false, server_time: "x" }), respuesta({ changed: false, server_time: "x" }));
    const api = crearApiBatallas();

    await api.estado("ABC234");
    expect(ultima(mock).url).toBe("https://api.example/api/battles/ABC234/");
    expect(ultima(mock).opciones.headers["X-Host-Token"]).toBeUndefined();

    await api.estado("ABC234", { since: "3.playing0", hostToken: "secreto" });
    expect(ultima(mock).url).toBe("https://api.example/api/battles/ABC234/?since=3.playing0");
    expect(ultima(mock).opciones.headers["X-Host-Token"]).toBe("secreto");
  });

  it("responder manda el id de la canción", async () => {
    const mock = simular(respuesta({ received: true }));
    await crearApiBatallas().responder("ABC234", 42);
    expect(ultima(mock).url).toBe("https://api.example/api/battles/ABC234/answer/");
    expect(ultima(mock).cuerpo).toEqual({ song_id: 42 });
  });

  it("empezar usa la ruta de empezar y la clave del organizador", async () => {
    const mock = simular(respuesta({ status: "playing" }));
    await crearApiBatallas().empezar("ABC234", "secreto");
    expect(ultima(mock).url).toBe("https://api.example/api/battles/ABC234/start/");
    expect(ultima(mock).opciones.headers["X-Host-Token"]).toBe("secreto");
  });

  it("mias devuelve la lista", async () => {
    const mock = simular(respuesta({ battles: [{ code: "ABC234", title: "", status: "finished", created_at: "x", players_count: 3, role: "player", my_position: 2 }] }));
    const lista = await crearApiBatallas().mias();
    expect(ultima(mock).url).toBe("https://api.example/api/battles/mine/");
    expect(lista[0].my_position).toBe(2);
  });

  it("con sesión manda el token", async () => {
    guardarSesion({ token: "tok", email: "a@b.uy" });
    const mock = simular(respuesta({ battles: [] }));
    await crearApiBatallas().mias();
    expect(ultima(mock).opciones.headers.Authorization).toBe("Bearer tok");
    borrarSesion();
  });

  it("los errores de la API llegan con su mensaje y su estado", async () => {
    simular(respuesta({ display_name: ["Ese nombre ya está en la sala. Elegí otro."] }, 400));
    await expect(crearApiBatallas().unirse("ABC234", "Ana")).rejects.toMatchObject({ status: 400, message: "Ese nombre ya está en la sala. Elegí otro." });
  });
});

describe("la clave del organizador", () => {
  it("se guarda y se lee por sala", () => {
    guardarHostToken("abc234", "secreto");
    expect(leerHostToken("ABC234")).toBe("secreto");
    expect(leerHostToken("OTRA22")).toBeNull();
  });

  it("si el almacenamiento falla no rompe", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(leerHostToken("ABC234")).toBeNull();
  });
});
