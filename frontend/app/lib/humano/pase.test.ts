import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comprobacionHumanaActiva, obtenerPase, olvidarPase } from "./pase";

const respuesta = (cuerpo: unknown, estado = 200) => ({
  ok: estado < 300,
  status: estado,
  json: () => Promise.resolve(cuerpo),
});

function turnstileFalso(...tokens: (string | Error)[]) {
  const render = vi.fn((_contenedor: HTMLElement, opciones: Record<string, (valor?: string) => void>) => {
    const siguiente = tokens.shift() ?? "token";
    queueMicrotask(() => (siguiente instanceof Error ? opciones["error-callback"]() : opciones.callback(siguiente as string)));
    return "widget-1";
  });
  const remove = vi.fn();
  vi.stubGlobal("turnstile", { render, remove });
  (window as unknown as { turnstile: unknown }).turnstile = { render, remove };
  return { render, remove };
}

beforeEach(() => {
  olvidarPase();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (window as unknown as { turnstile?: unknown }).turnstile;
  document.querySelectorAll(".comprobacion-humana").forEach((nodo) => nodo.remove());
});

describe("comprobación humana apagada (sin clave del sitio)", () => {
  it("no está activa y no hay pase: no se pide nada ni se muestra nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const pedir = vi.fn();
    vi.stubGlobal("fetch", pedir);

    expect(comprobacionHumanaActiva()).toBe(false);
    expect(await obtenerPase()).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });
});

describe("comprobación humana activa", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "clave-del-sitio"));

  it("resuelve el desafío, se lo cambia a la API por un pase y lo devuelve", async () => {
    const { render } = turnstileFalso("token-de-cloudflare");
    const pedir = vi.fn().mockResolvedValue(respuesta({ pass: "pase-1", expires_in: 1800 }));
    vi.stubGlobal("fetch", pedir);

    expect(comprobacionHumanaActiva()).toBe(true);
    expect(await obtenerPase()).toBe("pase-1");

    expect(render.mock.calls[0][1]).toMatchObject({ sitekey: "clave-del-sitio", appearance: "interaction-only" });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("https://api.example/api/human/");
    expect(JSON.parse(opciones.body)).toEqual({ token: "token-de-cloudflare" });
  });

  it("guarda el pase: la segunda vez no vuelve a molestar a la persona", async () => {
    const { render } = turnstileFalso("t1", "t2");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ pass: "pase-1", expires_in: 1800 })));

    await obtenerPase();
    await obtenerPase();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("dos pedidos a la vez comparten un solo desafío", async () => {
    const { render } = turnstileFalso("t1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ pass: "pase-1", expires_in: 1800 })));

    const [a, b] = await Promise.all([obtenerPase(), obtenerPase()]);

    expect(a).toBe(b);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("pide uno nuevo cuando el pase venció o se olvida", async () => {
    const { render } = turnstileFalso("t1", "t2");
    const pedir = vi.fn().mockResolvedValueOnce(respuesta({ pass: "pase-1", expires_in: 1800 })).mockResolvedValueOnce(respuesta({ pass: "pase-2", expires_in: 1800 }));
    vi.stubGlobal("fetch", pedir);

    expect(await obtenerPase()).toBe("pase-1");
    olvidarPase();

    expect(await obtenerPase()).toBe("pase-2");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("deja el widget en pantalla solo mientras hace falta y lo saca al terminar", async () => {
    const { remove } = turnstileFalso("t1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ pass: "pase-1", expires_in: 1800 })));

    await obtenerPase();

    expect(remove).toHaveBeenCalledWith("widget-1");
    expect(document.querySelector(".comprobacion-humana")).toBeNull();
  });

  it("si el desafío falla (programa automático, sin red) lo informa con un mensaje claro y un código", async () => {
    turnstileFalso(new Error("falló"));
    vi.stubGlobal("fetch", vi.fn());

    await expect(obtenerPase()).rejects.toMatchObject({
      name: "ApiError",
      codigo: "human_check_failed",
      message: expect.stringContaining("comprobar que sos una persona"),
    });
  });

  it("si la API rechaza el token tampoco hay pase, y se puede volver a intentar", async () => {
    turnstileFalso("t1", "t2");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(respuesta({ detail: "No pudimos comprobar que sos una persona." }, 400)).mockResolvedValueOnce(respuesta({ pass: "pase-2", expires_in: 1800 })),
    );

    await expect(obtenerPase()).rejects.toMatchObject({ codigo: "human_check_failed" });
    expect(await obtenerPase()).toBe("pase-2");
  });
});
