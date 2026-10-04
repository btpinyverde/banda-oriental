import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarSesion, borrarSesion } from "../cuenta/sesion";
import { guardarPartida } from "./almacen-historial";
import * as servidor from "./estadisticas-servidor";
import { ApiError, type EstadisticasServidor } from "./tipos";
import { useEstadisticasServidor } from "./useEstadisticasServidor";

const stats = (cambios: Partial<EstadisticasServidor> = {}): EstadisticasServidor => ({
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
  ...cambios,
});

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("useEstadisticasServidor", () => {
  it("arranca sin nada y trae las estadísticas del servidor al montar", async () => {
    const pedir = vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(stats());

    const { result } = renderHook(() => useEstadisticasServidor());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.current_streak).toBe(2));
    expect(pedir).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
  });

  it("si el servidor no responde se queda en null (la pantalla usa lo guardado en el dispositivo)", async () => {
    const pedir = vi.spyOn(servidor, "pedirEstadisticas").mockRejectedValue(new ApiError("sin red", 0));

    const { result } = renderHook(() => useEstadisticasServidor());

    await waitFor(() => expect(pedir).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("vuelve a pedirlas cuando termina una partida o se guarda el puntaje", async () => {
    const pedir = vi
      .spyOn(servidor, "pedirEstadisticas")
      .mockResolvedValueOnce(stats({ played: 3 }))
      .mockResolvedValueOnce(stats({ played: 4, current_streak: 3 }));
    const { result } = renderHook(() => useEstadisticasServidor());
    await waitFor(() => expect(result.current?.played).toBe(3));

    act(() =>
      guardarPartida({
        dia: "2026-10-04",
        ganada: true,
        intentos: 1,
        cancion: { title: "A", artist: "B", album: "C" },
      }),
    );

    await waitFor(() => expect(result.current?.played).toBe(4));
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("vuelve a pedirlas al iniciar o cerrar sesión, porque pasan a ser las de la cuenta", async () => {
    const pedir = vi
      .spyOn(servidor, "pedirEstadisticas")
      .mockResolvedValueOnce(stats({ played: 1 }))
      .mockResolvedValueOnce(stats({ played: 9 }));
    const { result } = renderHook(() => useEstadisticasServidor());
    await waitFor(() => expect(result.current?.played).toBe(1));

    act(() => guardarSesion({ token: "t", email: "ana@example.com" }));

    await waitFor(() => expect(result.current?.played).toBe(9));
    expect(pedir).toHaveBeenCalledTimes(2);
    act(() => borrarSesion());
  });

  it("una respuesta vieja no pisa a una más nueva", async () => {
    let resolverLenta: (valor: EstadisticasServidor) => void = () => {};
    vi.spyOn(servidor, "pedirEstadisticas")
      .mockImplementationOnce(() => new Promise((resolver) => (resolverLenta = resolver)))
      .mockResolvedValueOnce(stats({ played: 5 }));
    const { result } = renderHook(() => useEstadisticasServidor());

    act(() => window.dispatchEvent(new Event("banda-oriental:historial-cambio")));
    await waitFor(() => expect(result.current?.played).toBe(5));
    await act(async () => resolverLenta(stats({ played: 1 })));

    expect(result.current?.played).toBe(5);
  });

  it("en el modo demostración no pide nada al servidor", async () => {
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "1");
    vi.stubEnv("NODE_ENV", "development");
    const pedir = vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(stats());

    const { result } = renderHook(() => useEstadisticasServidor());

    await act(async () => {});
    expect(pedir).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
