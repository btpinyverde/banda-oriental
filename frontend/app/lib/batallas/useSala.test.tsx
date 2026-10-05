import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../juego/tipos";
import type { ApiBatallas, EstadoSala } from "./api-batallas";
import { useSala } from "./useSala";

const estado = (cambios: Partial<EstadoSala> = {}): EstadoSala => ({
  changed: true,
  server_time: new Date().toISOString(),
  key: "1.lobby0",
  code: "ABC234",
  title: "",
  role: "player",
  status: "lobby",
  round_count: 3,
  round_seconds: 10,
  phase: { name: "lobby", index: 0 },
  round: null,
  players: [{ name: "Ana" }],
  ...cambios,
});

function apiCon(...respuestas: unknown[]) {
  const estadoMock = vi.fn();
  respuestas.forEach((r) => (r instanceof Error ? estadoMock.mockRejectedValueOnce(r) : estadoMock.mockResolvedValueOnce(r)));
  estadoMock.mockResolvedValue(respuestas.at(-1) instanceof Error ? estado() : respuestas.at(-1));
  return { api: { estado: estadoMock } as unknown as ApiBatallas, estadoMock };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useSala", () => {
  it("sin un cliente propio no reinicia la consulta en cada render", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(estado()) });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderHook(() => useSala("ABC234"));

    await act(async () => {});
    rerender();
    rerender();
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("consulta de inmediato y luego cada 3 segundos en el lobby", async () => {
    const { api, estadoMock } = apiCon(estado());
    const { result } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    expect(estadoMock).toHaveBeenCalledTimes(1);
    expect(result.current.sala).toMatchObject({ code: "ABC234" });

    await act(async () => vi.advanceTimersByTimeAsync(2900));
    expect(estadoMock).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(estadoMock).toHaveBeenCalledTimes(2);
  });

  it("manda since con la última clave y conserva la sala cuando no hay cambios", async () => {
    const primera = estado({ key: "5.lobby0" });
    const { api, estadoMock } = apiCon(primera, { changed: false, server_time: new Date().toISOString() });
    const { result } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(3100));

    expect(estadoMock.mock.calls[1][1]).toMatchObject({ since: "5.lobby0" });
    expect(result.current.sala).toBe(primera);
  });

  it("corrige un reloj local atrasado con la hora del servidor", async () => {
    const delServidor = new Date(Date.now() + 10_000).toISOString();
    const { api } = apiCon(estado({ server_time: delServidor }));
    const { result } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    expect(Math.abs(result.current.ahora() - (Date.now() + 10_000))).toBeLessThan(50);
  });

  it("una respuesta sin hora del servidor no rompe el reloj", async () => {
    const estadoMock = vi
      .fn()
      .mockResolvedValueOnce({ joinable: true, code: "ABC234", title: "", round_count: 3, round_seconds: 10, players_count: 1 })
      // El servidor va 10 s adelantado: su hora se calcula en el momento de contestar.
      .mockImplementation(async () => estado({ server_time: new Date(Date.now() + 10_000).toISOString() }));
    const api = { estado: estadoMock } as unknown as ApiBatallas; // fuera del renderHook: un cliente nuevo en cada render reinicia la consulta
    const { result } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    expect(Number.isFinite(result.current.ahora())).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(3100));
    expect(Math.abs(result.current.ahora() - (Date.now() + 10_000))).toBeLessThan(50);
  });

  it("con la pestaña oculta hace igual la primera consulta y después deja de consultar hasta que se vea", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    try {
      const { api, estadoMock } = apiCon(estado());
      const { result } = renderHook(() => useSala("ABC234", api));

      await act(async () => {});
      expect(estadoMock).toHaveBeenCalledTimes(1);
      expect(result.current.sala).toMatchObject({ code: "ABC234" });
      await act(async () => vi.advanceTimersByTimeAsync(10_000));
      expect(estadoMock).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(estadoMock).toHaveBeenCalledTimes(2);
    } finally {
      delete (document as unknown as Record<string, unknown>).hidden;
    }
  });

  it("un error de red no corta la consulta", async () => {
    const { api, estadoMock } = apiCon(new ApiError("No se pudo conectar con el servidor.", 0), estado());
    const { result } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    expect((result.current.error as ApiError).status).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(3100));
    expect(estadoMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(result.current.error).toBeNull();
  });

  it("la cuenta regresiva y la ronda se consultan más seguido", async () => {
    const { api, estadoMock } = apiCon(estado({ status: "playing", phase: { name: "countdown", index: 0 }, key: "2.countdown0" }));
    renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(1600));
    expect(estadoMock).toHaveBeenCalledTimes(2);
  });

  it("deja de consultar cuando la batalla terminó", async () => {
    const { api, estadoMock } = apiCon(estado({ status: "finished", phase: { name: "finished", index: 2 }, key: "9.finished2" }));
    renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(estadoMock).toHaveBeenCalledTimes(1);
  });

  it("no consulta más al desmontarse", async () => {
    const { api, estadoMock } = apiCon(estado());
    const { unmount } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(20_000));
    expect(estadoMock).toHaveBeenCalledTimes(1);
  });

  it("refrescar consulta ya", async () => {
    const { api, estadoMock } = apiCon(estado());
    const { result } = renderHook(() => useSala("ABC234", api));

    await act(async () => {});
    await act(async () => result.current.refrescar());
    expect(estadoMock).toHaveBeenCalledTimes(2);
  });
});
