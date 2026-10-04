import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TablaIntentos, type IntentoMostrado } from "./TablaIntentos";

afterEach(cleanup);

const intento = (numero: number, extra: Partial<IntentoMostrado> = {}): IntentoMostrado => ({
  numero,
  feedback: { year: "newer", genre: "same", artist: "different", album: "different" },
  cancion: { id: numero, title: `Tema ${numero}`, artist: `Artista ${numero}`, album: `Disco ${numero}`, year: 2000, genre: "Rock" },
  correcto: false,
  ...extra,
});

describe("TablaIntentos", () => {
  it("muestra las cinco columnas y siempre seis filas, aunque no haya intentos", () => {
    render(<TablaIntentos intentos={[]} />);

    const tabla = screen.getByRole("table", { name: "Intentos" });
    for (const columna of ["Canción", "Año", "Género", "Artista", "Disco"]) {
      expect(within(tabla).getByRole("columnheader", { name: columna })).toBeInTheDocument();
    }
    // Las filas vacías son decorativas (aria-hidden), por eso se cuentan sin filtrar por accesibilidad.
    expect(within(tabla).getAllByRole("row", { hidden: true })).toHaveLength(7); // encabezado + 6 intentos
  });

  it("escribe lo que se adivinó en cada fila", () => {
    render(<TablaIntentos intentos={[intento(1)]} />);

    expect(screen.getByText("Tema 1")).toBeInTheDocument();
    expect(screen.getByText("Artista 1")).toBeInTheDocument();
    expect(screen.getByText("Disco 1")).toBeInTheDocument();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });

  it("pinta cada celda según el feedback y lo dice con texto, no solo con color", () => {
    render(<TablaIntentos intentos={[intento(1)]} />);

    const fila = screen.getByText("Tema 1").closest("tr") as HTMLElement;
    const celdas = within(fila).getAllByRole("cell");

    // Canción, Año, Género, Artista, Disco
    expect(celdas[1]).toHaveClass("celda--cerca");
    expect(celdas[2]).toHaveClass("celda--acierto");
    expect(celdas[3]).toHaveClass("celda--error");
    expect(celdas[4]).toHaveClass("celda--error");
    expect(within(celdas[2]).getByText("Acierto")).toHaveClass("solo-lectores");
    expect(within(celdas[3]).getByText("No coincide")).toBeInTheDocument();
  });

  it("agrega una flecha al año que indica hacia dónde está el correcto", () => {
    render(<TablaIntentos intentos={[intento(1, { feedback: { year: "newer", genre: "same", artist: "same", album: "same" } })]} />);

    const anio = screen.getByText("Tema 1").closest("tr")!.querySelectorAll("td")[1];
    expect(anio).toHaveTextContent("↑");
    expect(within(anio as HTMLElement).getByText("El año correcto es posterior")).toBeInTheDocument();
  });

  it("marca la celda del título como acierto solo en el intento correcto", () => {
    render(<TablaIntentos intentos={[intento(1), intento(2, { correcto: true })]} />);

    const titulo = (texto: string) => screen.getByText(texto).closest("td");
    expect(titulo("Tema 1")).not.toHaveClass("celda--acierto");
    expect(titulo("Tema 2")).toHaveClass("celda--acierto");
  });

  it("muestra un guion cuando no se sabe qué canción se adivinó (se limpió el navegador)", () => {
    render(<TablaIntentos intentos={[intento(1, { cancion: undefined })]} />);

    const fila = screen.getAllByRole("row")[1];
    expect(within(fila).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("usa el texto adivinado que mande el backend si no hay datos guardados", () => {
    render(<TablaIntentos intentos={[intento(1, { cancion: undefined, textoAdivinado: "Cuando sea grande" })]} />);

    expect(screen.getByText("Cuando sea grande")).toBeInTheDocument();
  });

  it("deja las filas vacías fuera del árbol de accesibilidad", () => {
    const { container } = render(<TablaIntentos intentos={[intento(1)]} />);

    expect(container.querySelectorAll("tr[aria-hidden='true']")).toHaveLength(5);
  });

  it("mantiene el año y su flecha juntos para que no se partan en dos líneas", () => {
    render(<TablaIntentos intentos={[intento(1)]} />);

    const anio = screen.getByText("Tema 1").closest("tr")!.querySelectorAll("td")[1];
    expect(anio).toHaveClass("celda--anio");
  });
});
