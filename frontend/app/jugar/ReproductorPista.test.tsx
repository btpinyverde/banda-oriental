import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archivoFalso, contextoActual, instalarAudioFalso } from "../lib/juego/audio-falso";
import { vaciarCache } from "../lib/juego/mezcla";
import { ReproductorPista } from "./ReproductorPista";

const BATERIA = { clave: "d:drums", url: "/drums.wav" };
const BAJO = { clave: "d:bass", url: "/bass.wav" };
// 300 muestras = 3 segundos.
const TRES_SEGUNDOS = archivoFalso(...Array(300).fill(0.5));

const ultimaLlamada = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.at(-1)?.[0];
const reproducir = () => screen.getByRole("button", { name: /Reproducir audio|Reintentar audio/ });
const vaciarPromesas = async () => {
  for (let i = 0; i < 6; i++) await act(async () => {});
};

/** Toca play y deja que el audio "suene": el reloj del audio avanza. */
async function tocarPlayYEscuchar(segundos = 0.5) {
  await act(async () => fireEvent.click(reproducir()));
  await vaciarPromesas();
  contextoActual().currentTime += segundos;
  await act(async () => void vi.advanceTimersByTime(100));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vaciarCache();
  instalarAudioFalso({ "/drums.wav": TRES_SEGUNDOS, "/bass.wav": TRES_SEGUNDOS });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReproductorPista", () => {
  it("arranca sin permitir responder y pide escuchar la pista", async () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={alCambiar} />);
    await vaciarPromesas();

    expect(reproducir()).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Escuchá la pista para poder responder");
    expect(ultimaLlamada(alCambiar)).toBe(false);
  });

  it("al tocar play hace sonar todas las pistas desbloqueadas a la vez", async () => {
    render(<ReproductorPista pistas={[BATERIA, BAJO]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();

    await act(async () => fireEvent.click(reproducir()));
    await vaciarPromesas();

    const contexto = contextoActual();
    expect(contexto.fuentes).toHaveLength(2);
    expect(contexto.fuentes.every((fuente) => fuente.start.mock.calls.length === 1)).toBe(true);
  });

  it("no habilita responder por tocar play: espera a que el audio avance de verdad", async () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={alCambiar} />);
    await vaciarPromesas();

    await act(async () => fireEvent.click(reproducir()));
    await vaciarPromesas();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando audio");
    expect(ultimaLlamada(alCambiar)).toBe(false);
  });

  it("habilita responder cuando el audio ya está sonando", async () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA, BAJO]} alCambiarListo={alCambiar} />);
    await vaciarPromesas();

    await tocarPlayYEscuchar();

    expect(ultimaLlamada(alCambiar)).toBe(true);
    expect(screen.getByRole("button", { name: "Pausar audio" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ya podés responder");
  });

  it("pausar después de escuchar no vuelve a bloquear", async () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={alCambiar} />);
    await vaciarPromesas();
    await tocarPlayYEscuchar();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pausar audio" })));

    expect(ultimaLlamada(alCambiar)).toBe(true);
    expect(reproducir()).toBeInTheDocument();
  });

  it("al reanudar sigue desde donde quedó", async () => {
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();
    await tocarPlayYEscuchar(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Pausar audio" })));

    await act(async () => fireEvent.click(reproducir()));
    await vaciarPromesas();

    const reanudada = contextoActual().fuentes.at(-1)!;
    expect(reanudada.start.mock.calls[0][1]).toBeCloseTo(1, 1);
  });

  it("muestra el tiempo transcurrido y la duración de la mezcla", async () => {
    render(<ReproductorPista pistas={[BATERIA, BAJO]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();
    expect(screen.getByText("0:00 / 0:03")).toBeInTheDocument();

    await tocarPlayYEscuchar(1.2);

    expect(screen.getByText("0:01 / 0:03")).toBeInTheDocument();
  });

  it("al terminar vuelve a mostrar play pero sigue permitiendo responder", async () => {
    const alCambiar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={alCambiar} />);
    await vaciarPromesas();
    await tocarPlayYEscuchar(0.5);

    contextoActual().currentTime += 5;
    await act(async () => void vi.advanceTimersByTime(100));

    expect(reproducir()).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:03")).toBeInTheDocument();
    expect(ultimaLlamada(alCambiar)).toBe(true);
  });

  it("pide al navegador que el audio suene aunque el celular esté en silencio", async () => {
    const sesion = { type: "auto" };
    vi.stubGlobal("navigator", { ...navigator, audioSession: sesion });
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();

    await act(async () => fireEvent.click(reproducir()));
    await vaciarPromesas();

    expect(sesion.type).toBe("playback");
  });

  it("al desmontarse frena el audio y cierra el contexto", async () => {
    const { unmount } = render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();
    await tocarPlayYEscuchar();

    unmount();

    expect(contextoActual().close).toHaveBeenCalled();
    contextoActual().fuentes.forEach((fuente) => expect(fuente.stop).toHaveBeenCalled());
  });
});

describe("ReproductorPista: fallos", () => {
  it("si no se pueden bajar las pistas ofrece reintentar y avisa una vez, para pedir direcciones nuevas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const alFallar = vi.fn();
    const alCambiar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={alCambiar} alFallar={alFallar} />);
    await vaciarPromesas();

    expect(screen.getByRole("button", { name: "Reintentar audio" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No se pudo reproducir el audio");
    expect(ultimaLlamada(alCambiar)).toBe(false);
    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("reintentar vuelve a bajar las pistas y reproduce", async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    pedir.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => TRES_SEGUNDOS.slice(0) }));
    vi.stubGlobal("fetch", pedir);
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} alFallar={vi.fn()} />);
    await vaciarPromesas();

    await tocarPlayYEscuchar();

    expect(screen.getByRole("button", { name: "Pausar audio" })).toBeInTheDocument();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("si el audio no empieza a avanzar en 15 segundos lo da por fallado", async () => {
    const alFallar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} alFallar={alFallar} />);
    await vaciarPromesas();

    await act(async () => fireEvent.click(reproducir())); // el reloj del audio no avanza
    await vaciarPromesas();
    await act(async () => void vi.advanceTimersByTime(15000));

    expect(screen.getByRole("button", { name: "Reintentar audio" })).toBeInTheDocument();
    expect(alFallar).toHaveBeenCalledTimes(1);
  });

  it("si el navegador no soporta Web Audio lo explica, sin pedir direcciones nuevas (no ayudaría)", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const alFallar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} alFallar={alFallar} />);
    await vaciarPromesas();

    expect(screen.getByRole("status")).toHaveTextContent("Tu navegador no puede reproducir el audio");
    expect(alFallar).not.toHaveBeenCalled();
  });

  it("no avisa fallos si todo anda bien", async () => {
    const alFallar = vi.fn();
    render(<ReproductorPista pistas={[BATERIA, BAJO]} alCambiarListo={vi.fn()} alFallar={alFallar} />);
    await vaciarPromesas();

    await tocarPlayYEscuchar();

    expect(alFallar).not.toHaveBeenCalled();
  });

  it("solo muestra el texto de estado a la vista cuando hay un error", async () => {
    render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();

    expect(screen.getByRole("status")).toHaveClass("solo-lectores");
  });
});

describe("onda de la mezcla", () => {
  it("mientras lee el audio muestra una onda provisoria, y después la del audio real", async () => {
    const { container } = render(<ReproductorPista pistas={[BATERIA, BAJO]} alCambiarListo={vi.fn()} />);

    expect(container.querySelectorAll(".onda__barra--provisoria").length).toBeGreaterThan(20);
    expect(container.querySelector(".reproductor__onda-base")).toBeNull();

    await vaciarPromesas();

    expect(container.querySelectorAll(".onda__barra").length).toBe(64);
    expect(container.querySelectorAll(".onda__barra--provisoria")).toHaveLength(0);
  });

  it("dibuja la suma de las pistas, no solo una", async () => {
    // La batería suena en la primera mitad y el bajo en la segunda: con las dos, la onda sube en toda su extensión.
    instalarAudioFalso({
      "/drums.wav": archivoFalso(...Array(200).fill(1), ...Array(200).fill(0)),
      "/bass.wav": archivoFalso(...Array(200).fill(0), ...Array(200).fill(1)),
    });
    const { container } = render(<ReproductorPista pistas={[BATERIA, BAJO]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();

    const alturas = [...container.querySelectorAll<HTMLElement>(".onda__barra")].map((b) => parseFloat(b.style.height));
    expect(Math.min(...alturas)).toBeGreaterThan(90);
  });

  it("si no se pueden leer las pistas deja la onda provisoria, quieta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { container } = render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();

    expect(container.querySelectorAll(".onda__barra--provisoria").length).toBeGreaterThan(20);
    expect(container.querySelector(".reproductor__onda--cargando")).toBeNull();
  });

  it("pinta las barras ya recorridas a medida que avanza el audio", async () => {
    const { container } = render(<ReproductorPista pistas={[BATERIA]} alCambiarListo={vi.fn()} />);
    await vaciarPromesas();

    await tocarPlayYEscuchar(1.5);

    const hechas = container.querySelectorAll(".onda__barra--hecha").length;
    expect(hechas).toBeGreaterThan(24);
    expect(hechas).toBeLessThan(40);
  });
});
