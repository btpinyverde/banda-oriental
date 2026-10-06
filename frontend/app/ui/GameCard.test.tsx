import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GameCard } from "./GameCard";

afterEach(cleanup);

// La maqueta de la portada es decorativa, pero lo que muestra tiene que ser verdad: cada fila es una canción real, con su artista,
// su disco y su año (los del catálogo). Si se cambia una fila, se cambia entera.
const FILAS_REALES = [
  ["Brindis por Pierrot", "1985", "Rock", "Jaime Roos", "Brindis por Pierrot"],
  ["Yendo a la casa de Damián", "2006", "Rock", "El Cuarteto de Nos", "Raro"],
  ["A las nueve", "2012", "Rock", "No Te Va Gustar", "El calor del pleno invierno"],
];

describe("GameCard (la maqueta de la portada)", () => {
  it("cada intento es una canción real, con su artista, disco y año verdaderos", () => {
    const { container } = render(<GameCard />);

    const celdas = [...container.querySelectorAll(".celda:not(.celda--encabezado):not(.celda--vacia)")].map((c) => c.textContent);
    const filas = FILAS_REALES.map((_, i) => celdas.slice(i * 5, i * 5 + 5));
    expect(filas).toEqual(FILAS_REALES);
  });

  it("el último intento es el acierto: todas sus celdas verdes; los otros no", () => {
    const { container } = render(<GameCard />);

    const estados = [...container.querySelectorAll(".celda:not(.celda--encabezado):not(.celda--vacia)")].map((c) => /celda--(\w+)/.exec(c.className)![1]);
    expect(estados.slice(10, 15)).toEqual(["acierto", "acierto", "acierto", "acierto", "acierto"]);
    expect(estados.slice(0, 5).every((e) => e === "acierto")).toBe(false);
    expect(estados.slice(5, 10).every((e) => e === "acierto")).toBe(false);
  });

  it("no aparece la canción de Tabaré Cardozo inventada", () => {
    const { container } = render(<GameCard />);

    expect(container.textContent).not.toContain("Tabaré Cardozo");
    expect(container.textContent).not.toContain("A Don José");
  });
});
