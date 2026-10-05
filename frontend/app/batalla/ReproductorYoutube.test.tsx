import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiYoutube } from "../lib/batallas/youtube-iframe";
import { ReproductorYoutube } from "./ReproductorYoutube";

type Eventos = { onReady?: () => void; onError?: (e: { data: number }) => void; onStateChange?: (e: { data: number }) => void };

/** Un reproductor de YouTube de mentira: guarda cómo se lo creó y deja disparar sus eventos. */
function falso() {
  const jugador = { playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn().mockReturnValue(-1) };
  const creado: { opciones?: { videoId: string; width: number; height: number; playerVars: Record<string, number>; events: Eventos } } = {};
  const api = {
    Player: vi.fn().mockImplementation(function (_el: unknown, opciones: NonNullable<typeof creado.opciones>) {
      creado.opciones = opciones;
      return jugador;
    }),
  } as unknown as ApiYoutube;
  return { api, jugador, creado, cargar: () => Promise.resolve(api) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function montar(extra: Partial<Parameters<typeof ReproductorYoutube>[0]> = {}) {
  const f = falso();
  const alFallar = vi.fn();
  const resultado = render(<ReproductorYoutube videoId="dQw4w9WgXcQ" inicio={12} activo={false} alFallar={alFallar} cargar={f.cargar} {...extra} />);
  await act(async () => {});
  return { ...f, alFallar, ...resultado };
}

describe("ReproductorYoutube", () => {
  it("crea el reproductor visible (200×200 como mínimo) con el video y el segundo de inicio", async () => {
    const { creado } = await montar();
    expect(creado.opciones).toMatchObject({ videoId: "dQw4w9WgXcQ", playerVars: expect.objectContaining({ start: 12, playsinline: 1 }) });
    expect(creado.opciones!.width).toBeGreaterThanOrEqual(200);
    expect(creado.opciones!.height).toBeGreaterThanOrEqual(200);
  });

  it("no suena hasta que la ronda se abre y entonces arranca desde el segundo elegido", async () => {
    const { creado, jugador, rerender, alFallar } = await montar();
    await act(async () => creado.opciones!.events.onReady!());
    expect(jugador.playVideo).not.toHaveBeenCalled();

    rerender(<ReproductorYoutube videoId="dQw4w9WgXcQ" inicio={12} activo alFallar={alFallar} cargar={() => Promise.resolve({ Player: vi.fn() } as unknown as ApiYoutube)} />);
    expect(jugador.seekTo).toHaveBeenCalledWith(12, true);
    expect(jugador.playVideo).toHaveBeenCalled();
  });

  it("si la ronda ya estaba abierta al estar listo, arranca", async () => {
    const { creado, jugador } = await montar({ activo: true });
    await act(async () => creado.opciones!.events.onReady!());
    expect(jugador.playVideo).toHaveBeenCalled();
  });

  it("se pausa cuando la ronda termina", async () => {
    const { creado, jugador, rerender, alFallar } = await montar({ activo: true });
    await act(async () => creado.opciones!.events.onReady!());
    rerender(<ReproductorYoutube videoId="dQw4w9WgXcQ" inicio={12} activo={false} alFallar={alFallar} cargar={() => Promise.resolve({ Player: vi.fn() } as unknown as ApiYoutube)} />);
    expect(jugador.pauseVideo).toHaveBeenCalled();
  });

  it.each([100, 101, 150, 2, 5])("el error %i del video avisa para pasar al audio de reserva", async (codigo) => {
    const { creado, alFallar } = await montar();
    await act(async () => creado.opciones!.events.onError!({ data: codigo }));
    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("si no se puede cargar el reproductor, avisa", async () => {
    const alFallar = vi.fn();
    render(<ReproductorYoutube videoId="dQw4w9WgXcQ" inicio={0} activo={false} alFallar={alFallar} cargar={() => Promise.reject(new Error("sin red"))} />);
    await act(async () => {});
    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("si el navegador no lo deja sonar solo, pide un toque y con el toque suena", async () => {
    const { creado, jugador } = await montar({ activo: true });
    await act(async () => creado.opciones!.events.onReady!());
    expect(screen.queryByRole("button", { name: /tocá para escuchar/i })).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(3600)); // sigue sin sonar (estado -1)
    const boton = screen.getByRole("button", { name: /tocá para escuchar/i });
    jugador.playVideo.mockClear();
    fireEvent.click(boton);
    expect(jugador.playVideo).toHaveBeenCalled();
  });

  it("si arranca solo no pide ningún toque", async () => {
    const { creado, jugador } = await montar({ activo: true });
    await act(async () => creado.opciones!.events.onReady!());
    jugador.getPlayerState.mockReturnValue(1);
    await act(async () => creado.opciones!.events.onStateChange!({ data: 1 }));
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(screen.queryByRole("button", { name: /tocá para escuchar/i })).toBeNull();
  });

  it("al desmontarse destruye el reproductor", async () => {
    const { jugador, unmount } = await montar();
    unmount();
    expect(jugador.destroy).toHaveBeenCalled();
  });
});
