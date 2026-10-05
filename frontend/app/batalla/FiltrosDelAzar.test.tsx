import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FiltrosAzar } from "../lib/batallas/api-batallas";
import { FiltrosDelAzar } from "./FiltrosDelAzar";

afterEach(cleanup);

const VACIOS: FiltrosAzar = { include: {}, exclude: {} };
const GENEROS = ["Rock", "Pop", "Candombe"];
const ARTISTAS = [
  { id: 7, name: "La Vela Puerca" },
  { id: 9, name: "Jorge Drexler" },
];

/** Un contenedor que guarda los filtros como lo hace la pantalla de crear, para probar el resultado de lo que se toca. */
function montar(extra: { cantidad?: number | null; pedidas?: number } = {}) {
  const ultimo = { valor: VACIOS };
  const buscarArtistas = vi.fn().mockResolvedValue(ARTISTAS);
  function Contenedor() {
    const [filtros, setFiltros] = useState<FiltrosAzar>(VACIOS);
    ultimo.valor = filtros;
    return <FiltrosDelAzar valor={filtros} alCambiar={setFiltros} generos={GENEROS} buscarArtistas={buscarArtistas} cantidad={extra.cantidad ?? null} pedidas={extra.pedidas ?? 10} />;
  }
  render(<Contenedor />);
  return { ultimo, buscarArtistas };
}

describe("FiltrosDelAzar", () => {
  it("el rango de años se guarda como números y se borra al vaciarlo", () => {
    const { ultimo } = montar();

    fireEvent.change(screen.getByLabelText(/^años desde/i), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText(/^años hasta/i), { target: { value: "2010" } });
    expect(ultimo.valor.include).toEqual({ year_from: 2000, year_to: 2010 });

    fireEvent.change(screen.getByLabelText(/^años desde/i), { target: { value: "" } });
    expect(ultimo.valor.include).toEqual({ year_to: 2010 });
  });

  it("la duración mínima y máxima se guardan en segundos", () => {
    const { ultimo } = montar();
    fireEvent.change(screen.getByLabelText(/duración mínima/i), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/duración máxima/i), { target: { value: "300" } });
    expect(ultimo.valor.include).toEqual({ duration_min: 120, duration_max: 300 });
  });

  it("se eligen géneros para incluir y se pueden quitar", () => {
    const { ultimo } = montar();

    fireEvent.change(screen.getByLabelText(/agregar género a incluir/i), { target: { value: "Rock" } });
    fireEvent.change(screen.getByLabelText(/agregar género a incluir/i), { target: { value: "Pop" } });
    expect(ultimo.valor.include.genres).toEqual(["Rock", "Pop"]);

    fireEvent.click(screen.getByRole("button", { name: /quitar rock de los géneros incluidos/i }));
    expect(ultimo.valor.include.genres).toEqual(["Pop"]);
    fireEvent.click(screen.getByRole("button", { name: /quitar pop de los géneros incluidos/i }));
    expect(ultimo.valor.include.genres).toBeUndefined();
  });

  it("se eligen géneros para excluir, sin repetirlos", () => {
    const { ultimo } = montar();
    fireEvent.change(screen.getByLabelText(/agregar género a excluir/i), { target: { value: "Candombe" } });
    fireEvent.change(screen.getByLabelText(/agregar género a excluir/i), { target: { value: "Candombe" } });
    expect(ultimo.valor.exclude.genres).toEqual(["Candombe"]);
  });

  it("los artistas se buscan y se incluyen o se excluyen", async () => {
    const { ultimo, buscarArtistas } = montar();

    fireEvent.change(screen.getByLabelText(/buscar artista/i), { target: { value: "vela" } });
    await waitFor(() => expect(buscarArtistas).toHaveBeenCalledWith("vela"));
    fireEvent.click(await screen.findByRole("button", { name: "Incluir a La Vela Puerca" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sacar a Jorge Drexler" }));

    expect(ultimo.valor.include.artists).toEqual([7]);
    expect(ultimo.valor.exclude.artists).toEqual([9]);
    expect(screen.getByRole("button", { name: /quitar a la vela puerca de los incluidos/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /quitar a jorge drexler de los excluidos/i }));
    expect(ultimo.valor.exclude.artists).toBeUndefined();
  });

  it("el tipo de disco se incluye o se excluye con casillas", () => {
    const { ultimo } = montar();
    fireEvent.click(screen.getByLabelText("Incluir álbumes"));
    fireEvent.click(screen.getByLabelText("Incluir EP"));
    fireEvent.click(screen.getByLabelText("Excluir singles"));
    expect(ultimo.valor.include.release_types).toEqual(["album", "ep"]);
    expect(ultimo.valor.exclude.release_types).toEqual(["single"]);

    fireEvent.click(screen.getByLabelText("Incluir EP"));
    expect(ultimo.valor.include.release_types).toEqual(["album"]);
  });

  it("se pueden excluir rangos de años", () => {
    const { ultimo } = montar();

    fireEvent.change(screen.getByLabelText(/excluir años desde/i), { target: { value: "1990" } });
    fireEvent.change(screen.getByLabelText(/excluir años hasta/i), { target: { value: "1999" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar rango a excluir/i }));
    expect(ultimo.valor.exclude.years).toEqual([[1990, 1999]]);

    fireEvent.click(screen.getByRole("button", { name: /quitar el rango 1990 a 1999/i }));
    expect(ultimo.valor.exclude.years).toBeUndefined();
  });

  it("no agrega un rango incompleto o al revés", () => {
    const { ultimo } = montar();
    fireEvent.change(screen.getByLabelText(/excluir años desde/i), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar rango a excluir/i }));
    expect(ultimo.valor.exclude.years).toBeUndefined();

    fireEvent.change(screen.getByLabelText(/excluir años hasta/i), { target: { value: "1990" } });
    fireEvent.click(screen.getByRole("button", { name: /agregar rango a excluir/i }));
    expect(ultimo.valor.exclude.years).toBeUndefined();
    expect(screen.getByRole("alert")).toHaveTextContent(/desde.*hasta/i);
  });

  it("dice cuántas canciones cumplen y avisa si no alcanzan", () => {
    montar({ cantidad: 4, pedidas: 10 });
    expect(screen.getByText(/hay 4 canciones que cumplen/i)).toBeInTheDocument();
    expect(screen.getByText(/no alcanzan para 10 canciones/i)).toBeInTheDocument();
  });

  it("si alcanzan no avisa nada raro", () => {
    montar({ cantidad: 120, pedidas: 10 });
    expect(screen.getByText(/hay 120 canciones que cumplen/i)).toBeInTheDocument();
    expect(screen.queryByText(/no alcanzan/i)).toBeNull();
  });

  it("mientras no sabe cuántas hay, lo dice", () => {
    montar({ cantidad: null });
    expect(screen.getByText(/contando canciones/i)).toBeInTheDocument();
  });

  it("un solo botón limpia todos los filtros", () => {
    const { ultimo } = montar();
    fireEvent.change(screen.getByLabelText(/^años desde/i), { target: { value: "2000" } });
    fireEvent.click(within(screen.getByRole("group", { name: /filtros/i })).getByRole("button", { name: /limpiar filtros/i }));
    expect(ultimo.valor).toEqual(VACIOS);
  });
});
