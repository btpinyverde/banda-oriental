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

const DESTACADOS = { streaks: [{ display_name: "CampeónDelPrado", value: 21 }], songs: [{ display_name: "TitoStereo", value: 342 }], accuracy: [{ display_name: "Afinada", value: 95 }] };
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
    expect(pedir).toHaveBeenCalledWith("all", expect.any(String), 1);
    expect(screen.getByRole("combobox", { name: "Período" })).toHaveValue("all");
  });

  it("pone el título Ranking, las pestañas (si las hay) y el período en una misma fila de controles", async () => {
    const { container } = render(<Ranking selector={<div role="group" aria-label="Qué ranking ver" />} />);
    await screen.findByText("Ana");

    const fila = container.querySelector(".ranking__controles") as HTMLElement;
    expect(within(fila).getByRole("heading", { level: 2, name: "Ranking" })).toBeInTheDocument();
    expect(within(fila).getByRole("group", { name: "Qué ranking ver" })).toBeInTheDocument();
    expect(within(fila).getByRole("combobox", { name: "Período" })).toBeInTheDocument();
  });

  it("en todo el tiempo no repite 'desde que arrancó el juego': el título del período ya lo dice", async () => {
    render(<Ranking />);
    await screen.findByText("Ana");

    expect(screen.queryByText(/Desde que arrancó el juego/)).toBeNull();
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
    expect(pedir).toHaveBeenLastCalledWith("week", expect.any(String), 1);
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

  it("muestra los otros récords (racha, precisión y canciones) y las estadísticas globales", async () => {
    render(<Ranking />);

    expect(await screen.findByRole("region", { name: "Mayor racha" })).toHaveTextContent("CampeónDelPrado");
    expect(screen.getByRole("region", { name: "Mejor precisión" })).toHaveTextContent("Afinada");
    expect(screen.getByRole("region", { name: "Más canciones descubiertas" })).toHaveTextContent("TitoStereo");
    expect(screen.getByRole("region", { name: "Estadísticas globales" })).toHaveTextContent("5.432");
  });

  it("si fallan las listas laterales o las cifras globales, la tabla funciona igual y esas partes no aparecen", async () => {
    vi.spyOn(servidor, "pedirDestacados").mockRejectedValue(new ApiError("caído", 500));
    vi.spyOn(servidor, "pedirGlobales").mockRejectedValue(new ApiError("caído", 500));
    render(<Ranking />);

    expect(await screen.findByRole("table", { name: "Ranking" })).toBeInTheDocument();
    await waitFor(() => expect(servidor.pedirGlobales).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Otros récords" })).toBeNull();
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

describe("Ranking: scroll infinito", () => {
  // jsdom no trae IntersectionObserver: se simula uno y el test dice cuándo "se ve" el final de la lista.
  let verElFinal: () => void;
  beforeEach(() => {
    class Observador {
      constructor(alVer: (entradas: { isIntersecting: boolean }[]) => void) {
        verElFinal = () => alVer([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("IntersectionObserver", Observador);
  });
  afterEach(() => vi.unstubAllGlobals());

  const pagina = (numero: number, filas: FilaRanking[], hayMas: boolean): RankingServidor => ({ ...respuesta("all", filas, null, 3), page: numero, has_more: hayMas });

  it("al llegar al final de la lista pide la página siguiente y la suma debajo, sin sacar lo que ya estaba", async () => {
    pedir.mockImplementation(async (_periodo, _id, numero = 1) => (numero === 1 ? pagina(1, [fila(1, "Ana", 950), fila(2, "Beto", 900)], true) : pagina(2, [fila(3, "Cata", 800)], false)));
    render(<Ranking />);
    await screen.findByText("Beto");
    expect(screen.queryByText("Cata")).toBeNull();

    await act(async () => verElFinal());

    expect(await screen.findByText("Cata")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(pedir).toHaveBeenLastCalledWith("all", expect.any(String), 2);
  });

  it("cuando no hay más páginas deja de pedir aunque se siga mirando el final", async () => {
    pedir.mockResolvedValue(pagina(1, [fila(1, "Ana", 950)], false));
    render(<Ranking />);
    await screen.findByText("Ana");

    await act(async () => verElFinal());

    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("no pide dos veces la misma página si el final se ve de nuevo mientras carga", async () => {
    let terminar!: (r: RankingServidor) => void;
    pedir.mockResolvedValueOnce(pagina(1, [fila(1, "Ana", 950)], true));
    pedir.mockImplementationOnce(() => new Promise((resolver) => (terminar = resolver)));
    render(<Ranking />);
    await screen.findByText("Ana");

    await act(async () => verElFinal());
    await act(async () => verElFinal());

    expect(pedir).toHaveBeenCalledTimes(2);
    await act(async () => terminar(pagina(2, [fila(2, "Beto", 900)], false)));
    expect(await screen.findByText("Beto")).toBeInTheDocument();
  });

  it("al cambiar de período vuelve a empezar desde la primera página", async () => {
    pedir.mockImplementation(async (periodo, _id, numero = 1) =>
      periodo === "day" ? { ...respuesta("day", [fila(1, "Hoy1", 10)], null, 1), page: 1, has_more: false } : numero === 1 ? pagina(1, [fila(1, "Ana", 950)], true) : pagina(2, [fila(2, "Beto", 900)], false),
    );
    render(<Ranking />);
    await screen.findByText("Ana");
    await act(async () => verElFinal());
    await screen.findByText("Beto");

    fireEvent.change(screen.getByRole("combobox", { name: "Período" }), { target: { value: "day" } });

    expect(await screen.findByText("Hoy1")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).toBeNull();
    expect(screen.queryByText("Beto")).toBeNull();
  });

  it("si falla una página siguiente lo dice al final de la lista y deja reintentar, sin perder lo ya cargado", async () => {
    pedir.mockResolvedValueOnce(pagina(1, [fila(1, "Ana", 950)], true));
    pedir.mockRejectedValueOnce(new ApiError("sin red", 0));
    pedir.mockResolvedValueOnce(pagina(2, [fila(2, "Beto", 900)], false));
    render(<Ranking />);
    await screen.findByText("Ana");

    await act(async () => verElFinal());
    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos cargar más jugadores/);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar" })));

    expect(await screen.findByText("Beto")).toBeInTheDocument();
  });

  it("si el navegador no puede observar el scroll, ofrece un botón para ver más", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    pedir.mockImplementation(async (_p, _i, numero = 1) => (numero === 1 ? pagina(1, [fila(1, "Ana", 950)], true) : pagina(2, [fila(2, "Beto", 900)], false)));
    render(<Ranking />);
    await screen.findByText("Ana");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ver más jugadores" })));

    expect(await screen.findByText("Beto")).toBeInTheDocument();
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
