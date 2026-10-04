import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DiaDelArchivo } from "../lib/archivo";
import { ListaDelArchivo } from "./ListaDelArchivo";

afterEach(cleanup);

const dia = (date: string, song_title: string, artist: string): DiaDelArchivo => ({ date, song_title, artist });

describe("ListaDelArchivo", () => {
  it("lista cada día con la canción, el artista y la fecha, y lleva a su página", () => {
    render(<ListaDelArchivo dias={[dia("2026-10-03", "A las nueve", "No Te Va Gustar")]} />);

    const enlace = screen.getByRole("link", { name: /A las nueve/ });
    expect(enlace).toHaveAttribute("href", "/archivo/2026-10-03");
    expect(enlace).toHaveTextContent("No Te Va Gustar");
    expect(enlace).toHaveTextContent(/3 de octubre/);
  });

  it("agrupa por mes, del más nuevo al más viejo, con el mes en minúscula como se escribe en español", () => {
    render(
      <ListaDelArchivo
        dias={[dia("2026-10-03", "Uno", "A"), dia("2026-10-02", "Dos", "B"), dia("2026-09-30", "Tres", "C")]}
      />,
    );

    const meses = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(meses[0]).toBe("octubre de 2026");
    expect(meses[1]).toMatch(/^(septiembre|setiembre) de 2026$/);
    expect(meses).toHaveLength(2);
    const octubre = screen.getByRole("heading", { level: 2, name: "octubre de 2026" }).closest("section") as HTMLElement;
    expect(within(octubre).getAllByRole("link")).toHaveLength(2);
  });

  it("cuando todavía no venció ningún día lo dice, sin inventar contenido", () => {
    render(<ListaDelArchivo dias={[]} />);

    expect(screen.getByText(/Todavía no hay días en el archivo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Jugar el diario/ })).toHaveAttribute("href", "/jugar");
  });

  it("si no se pudo consultar la API explica el problema y no dice que el archivo está vacío", () => {
    render(<ListaDelArchivo dias={null} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar el archivo/);
    expect(screen.queryByText(/Todavía no hay días/)).toBeNull();
  });

  it("tiene un título de página y avisa que el día vigente no se muestra para no arruinar el juego", () => {
    render(<ListaDelArchivo dias={[dia("2026-10-03", "Uno", "A")]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Archivo" })).toBeInTheDocument();
    expect(screen.getByText(/La canción de hoy no aparece hasta mañana/)).toBeInTheDocument();
  });
});
