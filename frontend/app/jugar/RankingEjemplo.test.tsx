import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RankingEjemplo } from "./RankingEjemplo";

afterEach(cleanup);

describe("RankingEjemplo", () => {
  it("avisa que son datos de ejemplo, para que nadie los tome por reales", () => {
    render(<RankingEjemplo />);

    expect(screen.getByText("Datos de ejemplo")).toBeInTheDocument();
  });

  it("lista el ranking del día con los puntos de cada uno y marca la fila de quien juega", () => {
    render(<RankingEjemplo />);

    const ranking = screen.getByRole("region", { name: "Ranking del día" });
    const filas = within(ranking).getAllByRole("listitem");
    expect(filas).toHaveLength(5);
    expect(within(filas[0]).getByText("lucas")).toBeInTheDocument();
    expect(within(filas[0]).getByText("1.240 pts")).toBeInTheDocument();
    expect(filas[3]).toHaveClass("lateral__fila--yo");
    expect(within(ranking).getByRole("link", { name: /Ver todos/ })).toHaveAttribute("href", "/ranking");
  });

  it("explica cómo se calcula el ranking", () => {
    render(<RankingEjemplo />);

    expect(screen.getByText(/menos intentos = más puntos/)).toBeInTheDocument();
  });
});
