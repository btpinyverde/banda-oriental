import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JuegoDiario } from "./JuegoDiario";
import { CANCION_DEL_DIA_DEMO, crearClienteDemo } from "../lib/juego/cliente-demo";
import { leerHistorial } from "../lib/juego/almacen-historial";
import { ApiError, type ClienteJuego } from "../lib/juego/tipos";

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(window.HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const campo = () => screen.getByRole("combobox");
const audio = () => document.querySelector("audio") as HTMLAudioElement;

/** Escucha la pista (el audio "suena") y envía la canción que se busca. */
async function responder(titulo: string) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reproducir audio" })));
  act(() => void fireEvent.playing(audio()));
  fireEvent.change(campo(), { target: { value: titulo } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(titulo) }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Enviar intento" })));
}

async function cargado(cliente: ClienteJuego = crearClienteDemo()) {
  render(<JuegoDiario cliente={cliente} />);
  await screen.findByRole("heading", { name: "¿Qué canción es?" });
}

describe("JuegoDiario: pistas vencidas", () => {
  it("si el audio falla, pide el estado de nuevo y usa las direcciones nuevas (las firmadas vencen a la hora)", async () => {
    const demo = crearClienteDemo();
    const enCurso = (url: string) => ({
      finished: false as const,
      day: "2026-10-03",
      attempt_number: 1,
      attempts_remaining: 6,
      unlocked_stems: [{ stem_type: "drums" as const, unlock_order: 1, url }],
      feedback_history: [],
    });
    const estadoDelDia = vi.fn().mockResolvedValueOnce(enCurso("/vieja.mp3")).mockResolvedValue(enCurso("/nueva.mp3"));
    await cargado({ ...demo, estadoDelDia });
    expect(audio().getAttribute("src")).toBe("/vieja.mp3");

    act(() => void fireEvent.error(audio()));

    await waitFor(() => expect(audio().getAttribute("src")).toBe("/nueva.mp3"));
    expect(estadoDelDia).toHaveBeenCalledTimes(2);
  });
});

describe("JuegoDiario: servidor dormido", () => {
  afterEach(() => vi.useRealTimers());

  it("si la carga tarda, avisa que el servidor está despertando, y lo saca cuando carga", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let responder!: (estado: unknown) => void;
    const demo = crearClienteDemo();
    const estadoDelDia = vi.fn(() => new Promise((resolver) => (responder = resolver)));
    render(<JuegoDiario cliente={{ ...demo, estadoDelDia } as unknown as ClienteJuego} />);
    expect(screen.queryByText(/está despertando/)).toBeNull();

    await act(async () => void vi.advanceTimersByTime(6_000));

    expect(screen.getByText(/está despertando/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando la canción de hoy…");

    const real = await demo.estadoDelDia("11111111-2222-4333-8444-555555555555");
    await act(async () => responder(real));
    await act(async () => {});
    expect(screen.queryByText(/está despertando/)).toBeNull();
  });
});

describe("JuegoDiario: carga", () => {
  it("muestra que está cargando y después el juego en el intento 1", async () => {
    render(<JuegoDiario cliente={crearClienteDemo()} />);

    expect(screen.getByText("Cargando la canción de hoy…")).toBeInTheDocument();
    expect(await screen.findByText("Intento 1 de 6")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pistas" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Intentos" })).toBeInTheDocument();
  });

  it("avisa cuando todavía no hay canción para hoy", async () => {
    const cliente = { ...crearClienteDemo(), estadoDelDia: async () => null };
    render(<JuegoDiario cliente={cliente} />);

    expect(await screen.findByText("Todavía no hay canción para hoy")).toBeInTheDocument();
  });

  it("ofrece reintentar si falla la carga y se recupera", async () => {
    const demo = crearClienteDemo();
    const estadoDelDia = vi.fn().mockRejectedValueOnce(new ApiError("Falla.", 500)).mockImplementation(demo.estadoDelDia);
    render(<JuegoDiario cliente={{ ...demo, estadoDelDia }} />);

    expect(await screen.findByText("No pudimos cargar el juego")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Intento 1 de 6")).toBeInTheDocument();
  });
});

describe("JuegoDiario: composición", () => {
  const antes = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("ordena la tarjeta como el diseño: título, reproductor, pistas, tabla, intento y buscador", async () => {
    await cargado();

    const orden = [
      screen.getByRole("heading", { name: "¿Qué canción es?" }),
      screen.getByRole("region", { name: "Pista de audio" }),
      screen.getByRole("list", { name: "Pistas" }),
      screen.getByRole("table", { name: "Intentos" }),
      screen.getByText("Intento 1 de 6"),
      screen.getByRole("combobox"),
    ];
    for (let i = 0; i < orden.length - 1; i++) expect(antes(orden[i], orden[i + 1])).toBe(true);
  });

  it("muestra el número del juego y el modo en chips, y la cuenta atrás en un chip amarillo", async () => {
    await cargado();

    expect(screen.getByText("#138")).toHaveClass("chip");
    expect(screen.getByText("Modo clásico")).toHaveClass("chip");
    const cuenta = screen.getByText(/Nueva canción en/).closest(".jugar__cuenta") as HTMLElement;
    expect(cuenta).toHaveClass("chip--amarillo");
    expect(within(cuenta).getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
  });
});

describe("JuegoDiario: jugar", () => {
  it("no deja enviar hasta que el audio suena", async () => {
    await cargado();

    fireEvent.change(campo(), { target: { value: "sin sa" } });
    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));

    expect(screen.getByRole("button", { name: "Enviar intento" })).toBeDisabled();
  });

  it("un intento errado agrega una fila, desbloquea una pista y pasa al intento 2", async () => {
    await cargado();

    await responder("Sin saber");

    expect(await screen.findByText("Intento 2 de 6")).toBeInTheDocument();
    expect(screen.getByText("Sin saber")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pistas" }).querySelectorAll(".stem--abierta")).toHaveLength(2);
  });

  it("si el envío falla muestra el error y deja volver a intentar", async () => {
    const demo = crearClienteDemo();
    const enviarIntento = vi.fn().mockRejectedValueOnce(new ApiError("El servidor tardó demasiado en responder.", 0));
    await cargado({ ...demo, enviarIntento });

    await responder("Sin saber");

    expect(await screen.findByRole("alert")).toHaveTextContent("El servidor tardó demasiado en responder.");
    expect(screen.getByText("Intento 1 de 6")).toBeInTheDocument();
  });

  it("al acertar muestra la pantalla final con la canción", async () => {
    await cargado();

    await responder(CANCION_DEL_DIA_DEMO.title);

    expect(await screen.findByRole("heading", { name: "¡La sacaste!" })).toBeInTheDocument();
    expect(screen.getByLabelText("Tu nombre para el ranking")).toBeInTheDocument();
  });

  it("al errar seis veces muestra la pantalla de derrota", async () => {
    const demo = crearClienteDemo();
    const canciones = (await demo.listarCanciones()).filter((c) => c.id !== CANCION_DEL_DIA_DEMO.id);
    await cargado(demo);

    for (let n = 1; n <= 6; n++) {
      await screen.findByText(`Intento ${n} de 6`);
      await responder(canciones[n - 1].title);
    }

    expect(await screen.findByRole("heading", { name: "Hoy no salió" })).toBeInTheDocument();
  });

  it("al terminar ofrece compartir el resultado con los colores de los intentos", async () => {
    await cargado();

    await responder("Sin saber");
    await screen.findByText("Intento 2 de 6");
    await responder(CANCION_DEL_DIA_DEMO.title);
    await screen.findByRole("heading", { name: "¡La sacaste!" });

    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
  });

  it("un día terminado que se vuelve a abrir, sin colores guardados, no ofrece compartir", async () => {
    const terminado = {
      finished: true as const,
      day: "2026-10-03",
      won: true,
      score_submitted: false,
      song: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
    };
    render(<JuegoDiario cliente={{ ...crearClienteDemo(), estadoDelDia: async () => terminado }} />);

    await screen.findByRole("heading", { name: "¡La sacaste!" });

    expect(screen.queryByRole("button", { name: "Compartir resultado" })).toBeNull();
  });

  it("guardar el puntaje muestra los puntos y oculta el formulario", async () => {
    await cargado();
    await responder(CANCION_DEL_DIA_DEMO.title);
    await screen.findByRole("heading", { name: "¡La sacaste!" });

    fireEvent.change(screen.getByLabelText("Tu nombre para el ranking"), { target: { value: "brandon" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar mi puntaje" })));

    await waitFor(() => expect(screen.getByText(/100 puntos/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Tu nombre para el ranking")).toBeNull();
  });
});

describe("JuegoDiario: historial en el dispositivo", () => {
  it("al ganar guarda la partida con los intentos, la canción y los colores de cada intento", async () => {
    await cargado();

    await responder(CANCION_DEL_DIA_DEMO.title);
    await screen.findByRole("heading", { name: "¡La sacaste!" });

    const [partida] = leerHistorial();
    expect(partida).toMatchObject({ ganada: true, intentos: 1, numero: 138, cancion: { title: "A las nueve", artist: "No Te Va Gustar" } });
    expect(partida.feedback).toHaveLength(1);
  });

  it("al perder guarda la partida como no ganada, con los seis intentos", async () => {
    const demo = crearClienteDemo();
    const canciones = (await demo.listarCanciones()).filter((c) => c.id !== CANCION_DEL_DIA_DEMO.id);
    await cargado(demo);

    for (let n = 1; n <= 6; n++) {
      await screen.findByText(`Intento ${n} de 6`);
      await responder(canciones[n - 1].title);
    }
    await screen.findByRole("heading", { name: "Hoy no salió" });

    const [partida] = leerHistorial();
    expect(partida).toMatchObject({ ganada: false, intentos: 6 });
    expect(partida.feedback).toHaveLength(6);
  });

  it("al guardar el puntaje lo suma a la partida ya guardada, sin duplicarla", async () => {
    await cargado();
    await responder(CANCION_DEL_DIA_DEMO.title);
    await screen.findByRole("heading", { name: "¡La sacaste!" });

    fireEvent.change(screen.getByLabelText("Tu nombre para el ranking"), { target: { value: "brandon" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar mi puntaje" })));
    await waitFor(() => expect(leerHistorial()[0].puntaje).toBe(100));

    expect(leerHistorial()).toHaveLength(1);
  });

  it("si se vuelve a abrir un día ya terminado, lo guarda igual con lo que informa el backend", async () => {
    const terminado = {
      finished: true as const,
      day: "2026-10-03",
      won: true,
      score_submitted: true,
      winning_attempt: 3,
      score: 70,
      song: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
    };
    const cliente = { ...crearClienteDemo(), estadoDelDia: async () => terminado };
    render(<JuegoDiario cliente={cliente} />);

    await screen.findByRole("heading", { name: "¡La sacaste!" });

    expect(leerHistorial()[0]).toMatchObject({ dia: "2026-10-03", ganada: true, intentos: 3, puntaje: 70 });
  });

  it("un día terminado sin datos de intentos queda con intentos desconocidos, no inventados", async () => {
    const terminado = {
      finished: true as const,
      day: "2026-10-03",
      won: true,
      score_submitted: false,
      song: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
    };
    render(<JuegoDiario cliente={{ ...crearClienteDemo(), estadoDelDia: async () => terminado }} />);

    await screen.findByRole("heading", { name: "¡La sacaste!" });

    expect(leerHistorial()[0].intentos).toBeNull();
  });
});

describe("JuegoDiario: cambio de día", () => {
  afterEach(() => vi.useRealTimers());

  it("si la página queda abierta pasada la medianoche, carga sola la canción del día nuevo", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-04T02:59:50Z")); // 23:59:50 del 3 de octubre en Montevideo
    const demo = crearClienteDemo();
    const enCurso = (day: string) => ({
      finished: false as const,
      day,
      attempt_number: 1,
      attempts_remaining: 6,
      unlocked_stems: [{ stem_type: "drums" as const, unlock_order: 1, url: `/demo/${day}.mp3` }],
      feedback_history: [],
    });
    const estadoDelDia = vi.fn().mockResolvedValueOnce(enCurso("2026-10-03")).mockResolvedValue(enCurso("2026-10-04"));
    render(<JuegoDiario cliente={{ ...demo, estadoDelDia }} />);
    await act(async () => {});
    await act(async () => {});
    expect(screen.getByText("3 oct")).toBeInTheDocument();

    vi.setSystemTime(new Date("2026-10-04T03:00:10Z"));
    await act(async () => void vi.advanceTimersByTime(15_000));
    await act(async () => {});
    await act(async () => {});

    expect(estadoDelDia).toHaveBeenCalledTimes(2);
    expect(screen.getByText("4 oct")).toBeInTheDocument();
  });
});
