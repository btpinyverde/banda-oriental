import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReproductorPista } from "./ReproductorPista";

let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;
let load: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  play = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  load = vi.spyOn(window.HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const audio = (contenedor: HTMLElement) => contenedor.querySelector("audio") as HTMLAudioElement;
const ultimaLlamada = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.at(-1)?.[0];

describe("ReproductorPista", () => {
  it("arranca sin permitir responder y pide escuchar la pista", () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    expect(screen.getByRole("button", { name: "Reproducir audio" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Escuchá la pista para poder responder");
    expect(ultimaLlamada(alCambiar)).toBe(false);
  });

  it("no habilita responder por tocar play: espera a que el audio suene de verdad", async () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));

    expect(play).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando audio");
    expect(ultimaLlamada(alCambiar)).toBe(false);
  });

  it("habilita responder cuando llega el evento playing", async () => {
    const alCambiar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    act(() => void fireEvent.playing(audio(container)));

    expect(ultimaLlamada(alCambiar)).toBe(true);
    expect(screen.getByRole("button", { name: "Pausar audio" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ya podés responder");
  });

  it("pausar después de escuchar no vuelve a bloquear", async () => {
    const alCambiar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    act(() => void fireEvent.playing(audio(container)));
    act(() => void fireEvent.pause(audio(container)));

    expect(ultimaLlamada(alCambiar)).toBe(true);
    expect(screen.getByRole("button", { name: "Reproducir audio" })).toBeInTheDocument();
  });

  it("una espera de carga (buffering) vuelve a bloquear hasta que siga sonando", async () => {
    const alCambiar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    act(() => void fireEvent.playing(audio(container)));
    act(() => void fireEvent.waiting(audio(container)));

    expect(ultimaLlamada(alCambiar)).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando audio");
  });

  it("un error de audio bloquea y ofrece reintentar", async () => {
    const alCambiar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    act(() => void fireEvent.error(audio(container)));

    expect(ultimaLlamada(alCambiar)).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo reproducir el audio");
    expect(screen.getByRole("button", { name: "Reintentar audio" })).toBeInTheDocument();
  });

  it("si el navegador rechaza reproducir (autoplay bloqueado) cae en el estado de error", async () => {
    play.mockRejectedValueOnce(new DOMException("bloqueado", "NotAllowedError"));
    render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));

    expect(screen.getByRole("button", { name: "Reintentar audio" })).toBeInTheDocument();
  });

  it("reintentar recarga el audio y vuelve a intentar", async () => {
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);
    act(() => void fireEvent.error(audio(container)));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar audio" })));

    expect(load).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
  });

  it("si el audio no empieza a sonar en 15 segundos lo da por fallado", async () => {
    vi.useFakeTimers();
    render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    await act(async () => void vi.advanceTimersByTime(15000));

    expect(screen.getByRole("button", { name: "Reintentar audio" })).toBeInTheDocument();
    expect(pause).toHaveBeenCalled();
  });

  it("muestra el tiempo transcurrido y la duración", () => {
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);
    const elemento = audio(container);
    Object.defineProperty(elemento, "duration", { configurable: true, value: 30 });
    Object.defineProperty(elemento, "currentTime", { configurable: true, value: 12 });

    act(() => void fireEvent.loadedMetadata(elemento));
    act(() => void fireEvent.timeUpdate(elemento));

    expect(screen.getByText("0:12 / 0:30")).toBeInTheDocument();
  });

  it("al terminar vuelve a mostrar play pero sigue permitiendo responder", async () => {
    const alCambiar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={alCambiar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    act(() => void fireEvent.playing(audio(container)));
    act(() => void fireEvent.ended(audio(container)));

    expect(ultimaLlamada(alCambiar)).toBe(true);
    expect(screen.getByRole("button", { name: "Reproducir audio" })).toBeInTheDocument();
  });

  it("solo muestra el texto de estado a la vista cuando hay un error", () => {
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);
    const estado = screen.getByRole("status");

    expect(estado).toHaveClass("solo-lectores");

    act(() => void fireEvent.error(audio(container)));

    expect(estado).not.toHaveClass("solo-lectores");
  });
});

describe("ReproductorPista: aviso de fallos", () => {
  it("avisa cuando el audio da error, para que el juego pueda pedir direcciones nuevas", () => {
    const alFallar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} alFallar={alFallar} />);

    act(() => void fireEvent.error(audio(container)));

    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando el navegador rechaza reproducir", async () => {
    play.mockRejectedValueOnce(new DOMException("bloqueado", "NotAllowedError"));
    const alFallar = vi.fn();
    render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} alFallar={alFallar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));

    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando el audio no empieza a sonar en 15 segundos", async () => {
    vi.useFakeTimers();
    const alFallar = vi.fn();
    render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} alFallar={alFallar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    await act(async () => void vi.advanceTimersByTime(15000));

    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("no avisa si todo anda bien", async () => {
    const alFallar = vi.fn();
    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} alFallar={alFallar} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
    act(() => void fireEvent.playing(audio(container)));

    expect(alFallar).not.toHaveBeenCalled();
  });
});

describe("onda del audio", () => {
  const señal = new Float32Array(600).map((_, i) => Math.sin(i / 7) * (i < 300 ? 0.2 : 1));

  afterEach(() => vi.unstubAllGlobals());

  it("dibuja barras con el volumen real del audio cuando se puede decodificar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = () => Promise.resolve({ getChannelData: () => señal });
        close = () => Promise.resolve();
      },
    );

    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);

    await waitFor(() => expect(container.querySelectorAll(".onda__barra").length).toBeGreaterThan(20));
    const alturas = [...container.querySelectorAll<HTMLElement>(".onda__barra")].map((b) => parseFloat(b.style.height));
    expect(Math.max(...alturas)).toBe(100);
    expect(alturas[0]).toBeLessThan(alturas[alturas.length - 1]);
    expect(container.querySelector(".reproductor__onda-base")).toBeNull();
  });

  it("si no se puede decodificar (sin permiso CORS, por ejemplo) usa la onda de adorno", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    vi.stubGlobal("AudioContext", class { close = () => Promise.resolve(); });

    const { container } = render(<ReproductorPista src="/p.mp3" alCambiarListo={vi.fn()} />);

    await act(async () => {});
    expect(container.querySelector(".reproductor__onda-base")).not.toBeNull();
    expect(container.querySelector(".onda__barra")).toBeNull();
  });
});
