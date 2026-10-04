import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarPartida } from "../lib/juego/almacen-historial";
import type { Partida } from "../lib/juego/historial";
import { Historial } from "./Historial";

const HOY = "2026-10-10";
const partida = (dia: string, ganada = true, intentos: number | null = 3, extra: Partial<Partida> = {}): Partida => ({
  dia,
  ganada,
  intentos,
  cancion: { title: `Tema ${dia}`, artist: "No Te Va Gustar", album: "El camino más largo" },
  ...extra,
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

describe("Historial: sin partidas", () => {
  it("explica que todavía no hay nada e invita a jugar", () => {
    render(<Historial />);

    expect(screen.getByRole("heading", { level: 1, name: "Mi historial" })).toBeInTheDocument();
    expect(screen.getByText("Todavía no jugaste ningún día.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jugar el diario/ })).toHaveAttribute("href", "/jugar");
    expect(screen.queryByRole("list", { name: "Días jugados" })).toBeNull();
  });
});

describe("Historial: con partidas", () => {
  beforeEach(() => {
    guardarPartida(partida("2026-10-08", true, 2));
    guardarPartida(partida("2026-10-09", false, 6));
    guardarPartida(partida("2026-10-10", true, 4));
  });

  it("avisa que se guarda en este dispositivo", () => {
    render(<Historial />);

    expect(screen.getByText(/se guarda en este navegador/i)).toBeInTheDocument();
  });

  it("lista los días del más reciente al más viejo, con la canción de cada uno", () => {
    render(<Historial />);

    const dias = within(screen.getByRole("list", { name: "Días jugados" })).getAllByRole("listitem");
    expect(dias).toHaveLength(3);
    expect(dias[0]).toHaveTextContent("Tema 2026-10-10");
    expect(dias[2]).toHaveTextContent("Tema 2026-10-08");
    expect(dias[0]).toHaveTextContent("No Te Va Gustar");
  });

  it("escribe la fecha de cada día en español", () => {
    render(<Historial />);

    expect(screen.getByText(/10 de oct/i)).toBeInTheDocument();
  });

  it("dice cómo le fue en cada día, con texto", () => {
    render(<Historial />);

    const dias = within(screen.getByRole("list", { name: "Días jugados" })).getAllByRole("listitem");
    expect(dias[0]).toHaveTextContent("Ganada en 4 intentos");
    expect(dias[1]).toHaveTextContent("No salió");
    expect(dias[2]).toHaveTextContent("Ganada en 2 intentos");
  });

  it("si no se sabe en cuántos intentos salió, solo dice que se ganó", () => {
    window.localStorage.clear();
    guardarPartida(partida("2026-10-10", true, null));

    render(<Historial />);

    const dia = screen.getByRole("list", { name: "Días jugados" });
    expect(dia).toHaveTextContent("Ganada");
    expect(dia).not.toHaveTextContent("intentos");
  });

  it("resume las jugadas, el porcentaje de aciertos y la racha máxima", () => {
    render(<Historial />);

    const resumen = screen.getByRole("region", { name: "Resumen" });
    expect(within(resumen).getByText("jugadas").closest("li")).toHaveTextContent("3");
    expect(within(resumen).getByText("aciertos").closest("li")).toHaveTextContent("67%");
    expect(within(resumen).getByText("racha máx.").closest("li")).toHaveTextContent("1");
  });

  it("muestra en cuántos intentos salieron las partidas ganadas", () => {
    render(<Historial />);

    const distribucion = screen.getByRole("region", { name: "Intentos en las partidas ganadas" });
    const filas = within(distribucion).getAllByRole("listitem");
    expect(filas).toHaveLength(6);
    expect(filas[1]).toHaveTextContent("2");
    expect(filas[1]).toHaveTextContent("1 partida");
    expect(filas[3]).toHaveTextContent("1 partida");
    expect(filas[0]).toHaveTextContent("0 partidas");
  });

  it("se actualiza solo cuando termina otra partida", () => {
    render(<Historial />);

    act(() => guardarPartida(partida("2026-10-07", true, 1)));

    expect(within(screen.getByRole("list", { name: "Días jugados" })).getAllByRole("listitem")).toHaveLength(4);
  });
});

describe("Historial: colores de los intentos", () => {
  it("dibuja una fila de cuatro celdas por intento, con los colores que tuvo cada dato", () => {
    guardarPartida(
      partida("2026-10-10", true, 2, {
        feedback: [
          { year: "newer", genre: "same", artist: "different", album: "unknown" },
          { year: "exact", genre: "same", artist: "same", album: "same" },
        ],
      }),
    );

    const { container } = render(<Historial />);

    const celdas = [...container.querySelectorAll(".cuadricula__celda")].map((celda) => celda.className.replace("cuadricula__celda ", ""));
    expect(celdas).toEqual([
      "cuadricula__celda--cerca",
      "cuadricula__celda--acierto",
      "cuadricula__celda--error",
      "cuadricula__celda--desconocido",
      "cuadricula__celda--acierto",
      "cuadricula__celda--acierto",
      "cuadricula__celda--acierto",
      "cuadricula__celda--acierto",
    ]);
  });

  it("no inventa colores cuando no se guardaron", () => {
    guardarPartida(partida("2026-10-10", true, 2));

    const { container } = render(<Historial />);

    expect(container.querySelector(".cuadricula")).toBeNull();
  });
});

describe("Historial: compartir", () => {
  const feedback = [
    { year: "newer" as const, genre: "same" as const, artist: "same" as const, album: "different" as const },
    { year: "exact" as const, genre: "same" as const, artist: "same" as const, album: "same" as const },
  ];

  it("cada día con colores guardados se puede compartir sin revelar la canción", () => {
    guardarPartida(partida("2026-10-09", true, 2, { feedback }));

    render(<Historial />);

    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
  });

  it("los días que ya pasaron también se pueden compartir mostrando la canción", () => {
    guardarPartida(partida("2026-10-09", true, 2, { feedback }));

    render(<Historial />);

    expect(screen.getByRole("button", { name: "Compartir mostrando la canción" })).toBeInTheDocument();
  });

  it("el día de hoy no se puede compartir mostrando la canción, para no quemarla", () => {
    guardarPartida(partida(HOY, true, 2, { feedback }));

    render(<Historial />);

    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compartir mostrando la canción" })).toBeNull();
  });

  it("los días sin colores guardados no ofrecen compartir", () => {
    guardarPartida(partida("2026-10-09", true, 2));

    render(<Historial />);

    expect(screen.queryByRole("button", { name: /Compartir/ })).toBeNull();
  });
});
