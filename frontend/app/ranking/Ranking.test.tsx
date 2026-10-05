import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { borrarSesion, guardarSesion } from "../lib/cuenta/sesion";
import * as servidor from "../lib/juego/estadisticas-servidor";
import { ApiError, type FilaRanking, type PeriodoRanking, type RankingServidor } from "../lib/juego/tipos";
import { Ranking } from "./Ranking";

const fila = (rank: number, display_name: string, score: number, games = 1): FilaRanking => ({ rank, display_name, score, games, current_streak: 3, win_percentage: 80, played: games });

const respuesta = (periodo: PeriodoRanking, entries: FilaRanking[], me: FilaRanking | null = null, players?: number): RankingServidor => ({
  period: periodo,
  from: periodo === "all" ? null : "2026-10-05",
  to: periodo === "all" ? null : "2026-10-11",
  entries,
  me,
  players,
});

const DESTACADOS = { streaks: [{ display_name: "CampeónDelPrado", value: 21 }], songs: [{ display_name: "TitoStereo", value: 342 }] };
const GLOBALES = { players: 5432, games: 12000, days: 124 };

let pedir: MockInstance<typeof servidor.pedirRanking>;
beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "1");
  pedir = vi.spyOn(servidor, "pedirRanking").mockResolvedValue(respuesta("all", [fila(1, "Ana", 950)]));
  vi.spyOn(servidor, "pedirDestacados").mockResolvedValue(DESTACADOS);
  vi.spyOn(servidor, "pedirGlobales").mockResolvedValue(GLOBALES);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Ranking: la página", () => {
  it("abre con el título, en el ranking de todo el tiempo, y muestra a los jugadores", async () => {
    render(<Ranking />);

    expect(screen.getByRole("heading", { level: 1, name: /Quién sabe más de música uruguaya/ })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Ranking" })).toHaveTextContent("Ana");
    expect(pedir).toHaveBeenCalledWith("all", expect.any(String));
    expect(screen.getByRole("combobox", { name: "Período" })).toHaveValue("all");
  });

  it("deja elegir el período, y al elegir otro pide ese ranking y lo muestra", async () => {
    pedir.mockImplementation(async (periodo) => (periodo === "week" ? respuesta("week", [fila(1, "Carla", 3000, 4)]) : respuesta("all", [fila(1, "Ana", 950)])));
    render(<Ranking />);
    await screen.findByText("Ana");
    const selector = screen.getByRole("combobox", { name: "Período" });
    for (const nombre of ["Todo el tiempo", "Hoy", "Esta semana", "Este mes"]) expect(within(selector).getByRole("option", { name: nombre })).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "week" } });

    expect(await screen.findByText("Carla")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).toBeNull();
    expect(pedir).toHaveBeenLastCalledWith("week", expect.any(String));
  });

  it("dice qué días cubre el período elegido", async () => {
    pedir.mockResolvedValue(respuesta("week", [fila(1, "Ana", 950)]));
    render(<Ranking />);

    expect(await screen.findByText(/Del lunes 5 de octubre al domingo 11 de octubre/)).toBeInTheDocument();
  });

  it("marca con texto la fila de quien mira, y si está fuera del top la muestra aparte, debajo", async () => {
    pedir.mockResolvedValue(respuesta("all", [fila(1, "Ana", 950)], fila(128, "Brandon", 300), 5432));
    render(<Ranking />);

    const aparte = await screen.findByRole("region", { name: "Tu puesto" });
    expect(aparte).toHaveTextContent("Brandon");
    expect(aparte).toHaveTextContent("Vos");
  });

  it("muestra 'Tu posición' con el puesto y el total de jugadores", async () => {
    pedir.mockResolvedValue(respuesta("all", [fila(1, "Ana", 950)], fila(128, "Brandon", 300), 5432));
    render(<Ranking />);

    const tarjeta = await screen.findByRole("region", { name: "Tu posición" });
    expect(tarjeta).toHaveTextContent("#128");
    expect(tarjeta).toHaveTextContent("de 5.432 jugadores");
  });

  it("muestra las listas de mejores rachas y de más canciones, y las estadísticas globales", async () => {
    render(<Ranking />);

    expect(await screen.findByRole("region", { name: "Mejores rachas" })).toHaveTextContent("CampeónDelPrado");
    expect(screen.getByRole("region", { name: "Más canciones" })).toHaveTextContent("TitoStereo");
    expect(screen.getByRole("region", { name: "Estadísticas globales" })).toHaveTextContent("5.432");
  });

  it("si fallan las listas laterales o las cifras globales, la tabla funciona igual y esas partes no aparecen", async () => {
    vi.spyOn(servidor, "pedirDestacados").mockRejectedValue(new ApiError("caído", 500));
    vi.spyOn(servidor, "pedirGlobales").mockRejectedValue(new ApiError("caído", 500));
    render(<Ranking />);

    expect(await screen.findByRole("table", { name: "Ranking" })).toBeInTheDocument();
    await waitFor(() => expect(servidor.pedirGlobales).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Mejores rachas" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Estadísticas globales" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si nadie guardó puntaje en ese período, lo dice e invita a jugar", async () => {
    pedir.mockResolvedValue(respuesta("all", []));
    render(<Ranking />);

    expect(await screen.findByText(/Todavía nadie guardó su puntaje/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Jugar el diario/ })[0]).toHaveAttribute("href", "/jugar");
    expect(screen.queryByRole("table", { name: "Ranking" })).toBeNull();
  });

  it("mientras carga lo avisa, y si el servidor estaba dormido explica la demora", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    pedir.mockReturnValue(new Promise(() => {}));
    render(<Ranking />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el ranking…");
    expect(screen.queryByText(/está despertando/)).toBeNull();
    await act(async () => void vi.advanceTimersByTime(6_000));

    expect(screen.getByText(/está despertando/)).toBeInTheDocument();
  });

  it("si falla muestra el error y permite reintentar", async () => {
    pedir.mockRejectedValueOnce(new ApiError("sin red", 0));
    pedir.mockResolvedValueOnce(respuesta("all", [fila(1, "Ana", 950)]));
    render(<Ranking />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos cargar el ranking/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar" })));

    expect(await screen.findByText("Ana")).toBeInTheDocument();
  });

  it("la respuesta de un período viejo no pisa a la del elegido después", async () => {
    let responderVieja!: (r: RankingServidor) => void;
    pedir.mockImplementationOnce(() => new Promise((resolver) => (responderVieja = resolver)));
    pedir.mockResolvedValueOnce(respuesta("day", [fila(1, "Nueva", 100)]));
    render(<Ranking />);

    fireEvent.change(screen.getByRole("combobox", { name: "Período" }), { target: { value: "day" } });
    await screen.findByText("Nueva");
    await act(async () => responderVieja(respuesta("all", [fila(1, "Vieja", 999)])));

    expect(screen.getByText("Nueva")).toBeInTheDocument();
    expect(screen.queryByText("Vieja")).toBeNull();
  });
});

describe("Ranking: el llamado a crear una cuenta", () => {
  it("se ofrece a quien no tiene sesión", async () => {
    render(<Ranking />);

    expect(await screen.findByRole("heading", { name: /Querés aparecer en el ranking/ })).toBeInTheDocument();
  });

  it("no se ofrece a quien ya la tiene", async () => {
    guardarSesion({ token: "tok", email: "ana@example.com" });
    render(<Ranking />);
    await screen.findByRole("table", { name: "Ranking" });

    expect(screen.queryByRole("heading", { name: /Querés aparecer en el ranking/ })).toBeNull();
    borrarSesion();
  });

  it("no se ofrece mientras las cuentas están apagadas (no se puede crear una)", async () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "");
    render(<Ranking />);
    await screen.findByRole("table", { name: "Ranking" });

    expect(screen.queryByRole("heading", { name: /Querés aparecer en el ranking/ })).toBeNull();
  });
});
