import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as servidor from "../lib/juego/estadisticas-servidor";
import { ApiError, type FilaRanking, type PeriodoRanking, type RankingServidor } from "../lib/juego/tipos";
import { Ranking } from "./Ranking";

const fila = (rank: number, display_name: string, score: number, games = 1): FilaRanking => ({ rank, display_name, score, games });

const respuesta = (periodo: PeriodoRanking, entries: FilaRanking[], me: FilaRanking | null = null): RankingServidor => ({
  period: periodo,
  from: periodo === "all" ? null : "2026-10-05",
  to: periodo === "all" ? null : "2026-10-11",
  entries,
  me,
});

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Ranking", () => {
  it("abre en el ranking de hoy y ofrece los otros tres períodos", async () => {
    const pedir = vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("day", [fila(1, "Ana", 950)]));

    render(<Ranking />);

    expect(screen.getByRole("heading", { level: 1, name: "Ranking" })).toBeInTheDocument();
    const pestanias = screen.getAllByRole("tab");
    expect(pestanias.map((p) => p.textContent)).toEqual(["Hoy", "Esta semana", "Este mes", "Siempre"]);
    expect(screen.getByRole("tab", { name: "Hoy" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("day", expect.stringMatching(/^[0-9a-f-]{36}$/)));
  });

  it("muestra la posición, el nombre, los puntos y las partidas de cada jugador", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(
      respuesta("day", [fila(1, "Ana", 1850, 2), fila(2, "Beto", 700, 1)]),
    );

    render(<Ranking />);

    const lista = await screen.findByRole("list", { name: /Ranking/ });
    const filas = within(lista).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("1");
    expect(filas[0]).toHaveTextContent("Ana");
    expect(filas[0]).toHaveTextContent("1.850");
    expect(filas[0]).toHaveTextContent("2 partidas");
    expect(filas[1]).toHaveTextContent("1 partida");
    expect(filas[1]).not.toHaveTextContent("1 partidas");
  });

  it("al elegir otro período pide ese ranking y lo muestra", async () => {
    const pedir = vi
      .spyOn(servidor, "pedirRanking")
      .mockImplementation(async (periodo) =>
        periodo === "week" ? respuesta("week", [fila(1, "Carla", 3000, 4)]) : respuesta("day", [fila(1, "Ana", 950)]),
      );
    render(<Ranking />);
    await screen.findByText("Ana");

    fireEvent.click(screen.getByRole("tab", { name: "Esta semana" }));

    expect(await screen.findByText("Carla")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).toBeNull();
    expect(screen.getByRole("tab", { name: "Esta semana" })).toHaveAttribute("aria-selected", "true");
    expect(pedir).toHaveBeenLastCalledWith("week", expect.any(String));
  });

  it("dice qué días cubre el período", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("week", [fila(1, "Ana", 100)]));
    render(<Ranking />);

    fireEvent.click(screen.getByRole("tab", { name: "Esta semana" }));

    expect(await screen.findByText(/lunes 5 de octubre/i)).toHaveTextContent(/domingo 11 de octubre/i);
  });

  it("escribe las fechas como en español: meses y días en minúscula", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("week", [fila(1, "Ana", 100)]));
    render(<Ranking />);

    fireEvent.click(screen.getByRole("tab", { name: "Esta semana" }));

    expect(await screen.findByText(/^Del lunes 5 de octubre al domingo 11 de octubre\.$/)).toBeInTheDocument();
  });

  it("los puntos y las partidas van en dos líneas, no en tres", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("day", [fila(1, "Ana", 1850, 2)]));
    render(<Ranking />);

    const datos = (await screen.findByText("1.850")).closest(".ranking__datos") as HTMLElement;

    expect(datos.children).toHaveLength(2);
    expect(datos.children[0]).toHaveTextContent("1.850 puntos");
    expect(datos.children[1]).toHaveTextContent("2 partidas");
  });

  it("marca la fila de quien mira, con texto y no solo con color", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(
      respuesta("day", [fila(1, "Ana", 950), fila(2, "Beto", 700)], fila(2, "Beto", 700)),
    );

    render(<Ranking />);

    const filaDeBeto = (await screen.findByText("Beto")).closest("li") as HTMLElement;
    expect(within(filaDeBeto).getByText("Vos")).toBeInTheDocument();
    const filaDeAna = screen.getByText("Ana").closest("li") as HTMLElement;
    expect(within(filaDeAna).queryByText("Vos")).toBeNull();
  });

  it("si quien mira está fuera del top, muestra su puesto aparte, debajo", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(
      respuesta("day", [fila(1, "Ana", 950)], fila(73, "Beto", 100)),
    );

    render(<Ranking />);

    const tuPuesto = await screen.findByRole("region", { name: "Tu puesto" });
    expect(tuPuesto).toHaveTextContent("73");
    expect(tuPuesto).toHaveTextContent("Beto");
    expect(tuPuesto).toHaveTextContent("100");
  });

  it("si nadie guardó puntaje, lo dice e invita a jugar", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("day", []));

    render(<Ranking />);

    expect(await screen.findByText(/Todavía nadie guardó su puntaje/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jugar el diario/ })).toHaveAttribute("href", "/jugar");
  });

  it("mientras carga lo avisa, y si el servidor estaba dormido explica la demora", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.spyOn(servidor, "pedirRanking").mockReturnValue(new Promise(() => {}));

    render(<Ranking />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el ranking");
    await act(async () => {
      vi.advanceTimersByTime(6500);
    });
    expect(screen.getByText(/servidor estaba dormido/)).toBeInTheDocument();
  });

  it("si falla muestra el error y permite reintentar", async () => {
    const pedir = vi
      .spyOn(servidor, "pedirRanking")
      .mockRejectedValueOnce(new ApiError("No se pudo conectar con el servidor.", 0))
      .mockResolvedValueOnce(respuesta("day", [fila(1, "Ana", 950)]));

    render(<Ranking />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el ranking");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("una respuesta lenta de otro período no pisa a la que se eligió después", async () => {
    let resolverDia: (r: RankingServidor) => void = () => {};
    vi.spyOn(servidor, "pedirRanking").mockImplementation((periodo) =>
      periodo === "day"
        ? new Promise((resolver) => (resolverDia = resolver))
        : Promise.resolve(respuesta("month", [fila(1, "Del mes", 10)])),
    );
    render(<Ranking />);

    fireEvent.click(screen.getByRole("tab", { name: "Este mes" }));
    await screen.findByText("Del mes");
    await act(async () => resolverDia(respuesta("day", [fila(1, "Del día", 99)])));

    expect(screen.getByText("Del mes")).toBeInTheDocument();
    expect(screen.queryByText("Del día")).toBeNull();
  });

  it("las pestañas se pueden recorrer con las flechas del teclado", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("day", []));
    render(<Ranking />);

    fireEvent.keyDown(screen.getByRole("tab", { name: "Hoy" }), { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "Esta semana" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Ranking: compartir mi posición", () => {
  const conPuesto = (periodo: PeriodoRanking, puesto: number, players = 128): RankingServidor => ({
    ...respuesta(periodo, [fila(1, "Carla", 3000, 4)], fila(puesto, "Ana", 900)),
    players,
  });

  it("si tenés puesto en la escala que estás mirando, podés compartirlo", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(conPuesto("day", 3));
    render(<Ranking />);

    expect(await screen.findByRole("button", { name: "Compartir mi posición" })).toBeInTheDocument();
  });

  it("sin puesto propio no aparece (nada que presumir)", async () => {
    vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("day", [fila(1, "Carla", 3000, 4)]));
    render(<Ranking />);
    await screen.findByText("Carla");

    expect(screen.queryByRole("button", { name: "Compartir mi posición" })).toBeNull();
  });

  it("comparte el puesto de cada escala: al cambiar de pestaña la imagen es la de esa escala", async () => {
    vi.spyOn(servidor, "pedirRanking").mockImplementation(async (periodo) => conPuesto(periodo, periodo === "week" ? 5 : 3));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) });
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:imagen");
    URL.revokeObjectURL = vi.fn();
    render(<Ranking />);
    await screen.findByRole("button", { name: "Compartir mi posición" });
    fireEvent.click(screen.getByRole("tab", { name: "Esta semana" }));

    await waitFor(() => expect(screen.getByRole("tab", { name: "Esta semana" })).toHaveAttribute("aria-selected", "true"));
    const boton = await screen.findByRole("button", { name: "Compartir mi posición" });
    await act(async () => fireEvent.click(boton));

    const pedido = String(fetchMock.mock.calls[0][0]);
    expect(pedido).toContain("p=week");
    expect(pedido).toContain("r=5");
    vi.unstubAllGlobals();
  });

  it("mientras carga otra escala no queda el botón de la anterior", async () => {
    let responder!: (r: RankingServidor) => void;
    vi.spyOn(servidor, "pedirRanking").mockImplementation((periodo) =>
      periodo === "day" ? Promise.resolve(conPuesto("day", 3)) : new Promise((resolver) => (responder = resolver)),
    );
    render(<Ranking />);
    await screen.findByRole("button", { name: "Compartir mi posición" });

    fireEvent.click(screen.getByRole("tab", { name: "Este mes" }));

    expect(screen.queryByRole("button", { name: "Compartir mi posición" })).toBeNull();
    await act(async () => responder(conPuesto("month", 9)));
  });
});

