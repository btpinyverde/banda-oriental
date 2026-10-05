import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/juego/tipos";
import type { ApiBatallas, BatallaResumen } from "../lib/batallas/api-batallas";
import { MisBatallas } from "./MisBatallas";

afterEach(cleanup);

const batalla = (cambios: Partial<BatallaResumen> = {}): BatallaResumen => ({
  code: "ABC234",
  title: "Cumple de Ana",
  status: "finished",
  created_at: "2026-10-05T20:00:00Z",
  players_count: 4,
  role: "player",
  my_position: 2,
  ...cambios,
});

const apiCon = (metodos: Partial<Record<keyof ApiBatallas, ReturnType<typeof vi.fn>>>) => metodos as unknown as ApiBatallas;

describe("MisBatallas", () => {
  it("lista las batallas con su título, los jugadores y tu puesto", async () => {
    render(<MisBatallas api={apiCon({ mias: vi.fn().mockResolvedValue([batalla(), batalla({ code: "ZZZ999", title: "", my_position: null, role: "host", status: "finished" })]) })} />);

    expect(await screen.findByText("Cumple de Ana")).toBeInTheDocument();
    expect(screen.getAllByText(/4 jugadores/)).toHaveLength(2);
    expect(screen.getByText(/quedaste 2\.º/i)).toBeInTheDocument();
    expect(screen.getByText("Batalla ZZZ999")).toBeInTheDocument();
    expect(screen.getByText(/la organizaste/i)).toBeInTheDocument();
  });

  it("sin batallas invita a crear una", async () => {
    render(<MisBatallas api={apiCon({ mias: vi.fn().mockResolvedValue([]) })} />);

    expect(await screen.findByText(/todavía no jugaste ninguna batalla/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crear una batalla/i })).toHaveAttribute("href", "/batalla");
  });

  it("al abrir una batalla terminada muestra su ranking", async () => {
    const estado = vi.fn().mockResolvedValue({
      changed: true,
      ranking: [
        { position: 1, name: "Ana", points: 250, correct: 2 },
        { position: 2, name: "Beto", points: 100, correct: 1 },
      ],
    });
    render(<MisBatallas api={apiCon({ mias: vi.fn().mockResolvedValue([batalla()]), estado })} />);

    fireEvent.click(await screen.findByRole("button", { name: /cumple de ana/i }));

    const tabla = await screen.findByRole("table");
    expect(estado).toHaveBeenCalledWith("ABC234");
    expect(within(tabla).getByText("Ana")).toBeInTheDocument();
    expect(within(tabla).getByText("250")).toBeInTheDocument();
  });

  it("una batalla en curso lleva a su sala", async () => {
    render(<MisBatallas api={apiCon({ mias: vi.fn().mockResolvedValue([batalla({ status: "playing", my_position: null })]) })} />);
    expect(await screen.findByRole("link", { name: /cumple de ana/i })).toHaveAttribute("href", "/batalla/ABC234");
  });

  it("si falla la carga permite reintentar", async () => {
    const mias = vi.fn().mockRejectedValueOnce(new ApiError("No se pudo conectar con el servidor.", 0)).mockResolvedValue([]);
    render(<MisBatallas api={apiCon({ mias })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos cargar/i);
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(mias).toHaveBeenCalledTimes(2));
  });
});
