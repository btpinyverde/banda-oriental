import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENTO_HISTORIAL } from "../lib/juego/almacen-historial";
import * as servidor from "../lib/juego/estadisticas-servidor";
import { ApiError, type FilaRanking, type RankingServidor } from "../lib/juego/tipos";
import { RankingDelDia } from "./RankingDelDia";

vi.mock("../lib/juego/estadisticas-servidor");

const fila = (rank: number, display_name: string, score: number, games = 1): FilaRanking => ({ rank, display_name, score, games });
const ranking = (entries: FilaRanking[], me: FilaRanking | null = null): RankingServidor => ({
  period: "day",
  from: "2026-10-04",
  to: "2026-10-04",
  entries,
  me,
});

const pedir = vi.mocked(servidor.pedirRanking);

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("RankingDelDia", () => {
  it("muestra los puestos reales del día con nombre y puntos, y lleva al ranking completo", async () => {
    pedir.mockResolvedValue(ranking([fila(1, "lucas", 1240), fila(2, "sol", 980)]));

    render(<RankingDelDia />);

    const lista = await screen.findByRole("list", { name: "Ranking del día" });
    const filas = within(lista).getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("lucas");
    expect(filas[0]).toHaveTextContent("1.240");
    expect(screen.getByRole("link", { name: /Ver todos/ })).toHaveAttribute("href", "/ranking");
    expect(pedir).toHaveBeenCalledWith("day", expect.any(String));
  });

  it("muestra solo los cinco primeros", async () => {
    pedir.mockResolvedValue(ranking(Array.from({ length: 9 }, (_, i) => fila(i + 1, `jugador${i + 1}`, 1000 - i))));

    render(<RankingDelDia />);

    expect(await screen.findAllByRole("listitem")).toHaveLength(5);
  });

  it("marca la fila propia cuando está entre las primeras", async () => {
    pedir.mockResolvedValue(ranking([fila(1, "lucas", 1240), fila(2, "yo", 980)], fila(2, "yo", 980)));

    render(<RankingDelDia />);

    const propia = (await screen.findAllByRole("listitem"))[1];
    expect(propia).toHaveTextContent("Vos");
  });

  it("si está fuera de los cinco primeros, muestra igual su puesto aparte", async () => {
    pedir.mockResolvedValue(
      ranking(Array.from({ length: 6 }, (_, i) => fila(i + 1, `jugador${i + 1}`, 1000 - i)), fila(12, "yo", 300)),
    );

    render(<RankingDelDia />);

    const propia = await screen.findByTestId("mi-puesto");
    expect(propia).toHaveTextContent("12");
    expect(propia).toHaveTextContent("Vos");
  });

  it("si todavía nadie guardó su puntaje, invita a ser el primero en vez de dejar un hueco", async () => {
    pedir.mockResolvedValue(ranking([]));

    render(<RankingDelDia />);

    expect(await screen.findByText(/Todavía nadie guardó su puntaje hoy/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Ranking del día" })).toBeNull();
  });

  it("mientras llega muestra marcas de carga, no un hueco", () => {
    pedir.mockReturnValue(new Promise(() => {}));

    const { container } = render(<RankingDelDia />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("si el servidor no responde lo dice y deja reintentar", async () => {
    pedir.mockRejectedValueOnce(new ApiError("sin red", 0));
    pedir.mockResolvedValueOnce(ranking([fila(1, "lucas", 1240)]));
    render(<RankingDelDia />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el ranking");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar" })));

    expect(await screen.findByText("lucas")).toBeInTheDocument();
  });

  it("se actualiza cuando la persona guarda su puntaje", async () => {
    pedir.mockResolvedValueOnce(ranking([]));
    pedir.mockResolvedValueOnce(ranking([fila(1, "yo", 900)], fila(1, "yo", 900)));
    render(<RankingDelDia />);
    await screen.findByText(/Todavía nadie/);

    await act(async () => void window.dispatchEvent(new Event(EVENTO_HISTORIAL)));

    expect(await screen.findByText("yo")).toBeInTheDocument();
  });

  it("con puesto propio se puede compartir; sin él, no", async () => {
    pedir.mockResolvedValueOnce({ ...ranking([fila(1, "lucas", 1240)], fila(4, "yo", 700)), players: 20 });
    const { unmount } = render(<RankingDelDia />);
    expect(await screen.findByRole("button", { name: "Compartir mi posición" })).toBeInTheDocument();
    unmount();

    pedir.mockResolvedValueOnce(ranking([fila(1, "lucas", 1240)]));
    render(<RankingDelDia />);
    await screen.findByText("lucas");

    expect(screen.queryByRole("button", { name: "Compartir mi posición" })).toBeNull();
  });
});

