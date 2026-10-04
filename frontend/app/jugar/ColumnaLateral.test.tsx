import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarPartida } from "../lib/juego/almacen-historial";
import type { Partida } from "../lib/juego/historial";
import { ColumnaLateral } from "./ColumnaLateral";

const HOY = "2026-10-10";
const partida = (dia: string, ganada = true, intentos: number | null = 3, extra: Partial<Partida> = {}): Partida => ({
  dia,
  ganada,
  intentos,
  ...extra,
  cancion: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
});

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HOY}T15:00:00Z`));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const estadistica = (etiqueta: string) => within(screen.getByRole("region", { name: /Mis estadísticas/ })).getByText(etiqueta).closest("li") as HTMLElement;

describe("ColumnaLateral: sin partidas", () => {
  it("muestra todo en cero e invita a jugar, sin inventar números", () => {
    render(<ColumnaLateral />);

    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("0 días")).toBeInTheDocument();
    expect(screen.getByText("Jugá hoy para empezar tu racha.")).toBeInTheDocument();
    expect(estadistica("jugadas")).toHaveTextContent("0");
    expect(estadistica("aciertos")).toHaveTextContent("—");
    expect(estadistica("intentos promedio")).toHaveTextContent("—");
  });
});

describe("ColumnaLateral: con lo jugado en el dispositivo", () => {
  beforeEach(() => {
    guardarPartida(partida("2026-10-08", true, 2));
    guardarPartida(partida("2026-10-09", true, 3));
    guardarPartida(partida("2026-10-10", true, 4));
  });

  it("muestra la racha actual", () => {
    render(<ColumnaLateral />);

    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("3 días")).toBeInTheDocument();
    expect(screen.queryByText("Jugá hoy para empezar tu racha.")).toBeNull();
  });

  it("calcula jugadas, porcentaje de aciertos, racha máxima y promedio de intentos", () => {
    render(<ColumnaLateral />);

    expect(estadistica("jugadas")).toHaveTextContent("3");
    expect(estadistica("aciertos")).toHaveTextContent("100%");
    expect(estadistica("racha máx.")).toHaveTextContent("3");
    expect(estadistica("intentos promedio")).toHaveTextContent("3");
  });

  it("escribe el promedio con coma decimal, como se usa en Uruguay", () => {
    guardarPartida(partida("2026-10-05", true, 1));

    render(<ColumnaLateral />);

    expect(estadistica("intentos promedio")).toHaveTextContent("2,5");
  });

  it("se actualiza cuando termina otra partida", () => {
    window.localStorage.clear();
    render(<ColumnaLateral />);
    expect(estadistica("jugadas")).toHaveTextContent("0");

    act(() => guardarPartida(partida(HOY, true, 2)));

    expect(estadistica("jugadas")).toHaveTextContent("1");
    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("1 día")).toBeInTheDocument();
  });

  it("los cinco puntos de la racha cuentan cómo fueron los últimos cinco días", () => {
    guardarPartida(partida("2026-10-07", false, 6));
    const { container } = render(<ColumnaLateral />);

    const puntos = [...container.querySelectorAll(".lateral__puntos span")].map((p) => p.className);
    expect(puntos).toEqual([
      "lateral__punto--sin-jugar",
      "lateral__punto--perdida",
      "lateral__punto--ganada",
      "lateral__punto--ganada",
      "lateral__punto--ganada",
    ]);
  });

  it("describe los últimos cinco días con texto, no solo con color", () => {
    render(<ColumnaLateral />);

    expect(screen.getByText(/Últimos 5 días: .*ganaste/)).toBeInTheDocument();
  });
});

describe("ColumnaLateral: enlaces y colores", () => {
  it("lleva al historial completo", () => {
    render(<ColumnaLateral />);

    expect(screen.getByRole("link", { name: /Ver historial/ })).toHaveAttribute("href", "/historial");
  });

  it("no usa amarillo ni rosa en los datos: destaca solo el promedio de intentos", () => {
    const { container } = render(<ColumnaLateral />);

    expect(container.querySelector(".lateral__dato--amarillo, .lateral__dato--rosa")).toBeNull();
    expect(container.querySelectorAll(".lateral__dato--destacado")).toHaveLength(1);
  });

  it("no muestra el ranking de ejemplo salvo que se pida", () => {
    const { rerender } = render(<ColumnaLateral />);
    expect(screen.queryByRole("region", { name: "Ranking del día" })).toBeNull();

    rerender(<ColumnaLateral conRankingEjemplo />);
    expect(screen.getByRole("region", { name: "Ranking del día" })).toBeInTheDocument();
    expect(screen.getByText("Datos de ejemplo")).toBeInTheDocument();
  });
});

describe("ColumnaLateral: compartir el resultado de hoy", () => {
  const feedback = [{ year: "newer" as const, genre: "same" as const, artist: "same" as const, album: "different" as const }];

  it("ofrece compartir cuando hoy ya se jugó y se guardaron los colores de los intentos", () => {
    guardarPartida(partida(HOY, true, 1, { feedback }));

    render(<ColumnaLateral />);

    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
  });

  it("no lo ofrece si hoy todavía no se jugó", () => {
    guardarPartida(partida("2026-10-09", true, 1, { feedback }));

    render(<ColumnaLateral />);

    expect(screen.queryByRole("button", { name: "Compartir resultado" })).toBeNull();
  });

  it("no lo ofrece si hoy se jugó pero no hay colores guardados", () => {
    guardarPartida(partida(HOY, true, 1));

    render(<ColumnaLateral />);

    expect(screen.queryByRole("button", { name: "Compartir resultado" })).toBeNull();
  });
});
