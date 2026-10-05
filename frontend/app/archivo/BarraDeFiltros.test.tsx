import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarraDeFiltros } from "./BarraDeFiltros";

const empujar = vi.fn();
const reemplazar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: empujar, replace: reemplazar }) }));

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const DECADAS = [1960, 1990, 2000];
const montar = (extra: Partial<Parameters<typeof BarraDeFiltros>[0]> = {}) =>
  render(<BarraDeFiltros q="" decada="" orden="title" decadas={DECADAS} parametros={{}} {...extra} />);
const escribir = (texto: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en el archivo" }), { target: { value: texto } });

describe("BarraDeFiltros", () => {
  it("tiene el buscador, la década y el orden, con lo que ya estaba elegido", () => {
    montar({ q: "luna", decada: "1990", orden: "newest" });

    expect(screen.getByRole("searchbox", { name: "Buscar en el archivo" })).toHaveValue("luna");
    expect(screen.getByRole("combobox", { name: "Década" })).toHaveValue("1990");
    expect(screen.getByRole("combobox", { name: "Ordenar por" })).toHaveValue("newest");
    expect(screen.getByRole("option", { name: "Todas las décadas" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Años 60" })).toHaveValue("1960");
    expect(screen.getByRole("option", { name: "Años 2000" })).toHaveValue("2000");
  });

  it("anda sin JavaScript: es un formulario GET que conserva el género y la vista elegidos", () => {
    const { container } = montar({ parametros: { genero: "Rock", vista: "lista" } });

    const formulario = container.querySelector("form")!;
    expect(formulario).toHaveAttribute("action", "/archivo");
    expect(formulario).toHaveAttribute("method", "get");
    expect(formulario.querySelector('input[type="hidden"][name="genero"]')).toHaveValue("Rock");
    expect(formulario.querySelector('input[type="hidden"][name="vista"]')).toHaveValue("lista");
  });

  it("al escribir busca cuando se deja de escribir (una vez, no por letra), sin llenar el historial", () => {
    montar();

    escribir("l");
    escribir("lu");
    escribir("luna");
    expect(reemplazar).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(400));

    expect(reemplazar).toHaveBeenCalledTimes(1);
    expect(reemplazar).toHaveBeenCalledWith("/archivo?q=luna", { scroll: false });
    expect(empujar).not.toHaveBeenCalled();
  });

  it("al buscar conserva el género y vuelve a la primera página", () => {
    montar({ decada: "1990", parametros: { genero: "Rock", pagina: "4" } });

    escribir("luna");
    act(() => void vi.advanceTimersByTime(400));

    expect(reemplazar).toHaveBeenCalledWith("/archivo?genero=Rock&q=luna&decada=1990", { scroll: false });
  });

  it("al borrar lo escrito se quita la búsqueda de la dirección", () => {
    montar({ q: "luna", parametros: { genero: "Rock" } });

    escribir("   ");
    act(() => void vi.advanceTimersByTime(400));

    expect(reemplazar).toHaveBeenCalledWith("/archivo?genero=Rock", { scroll: false });
  });

  it("no vuelve a navegar si lo escrito es lo que ya estaba", () => {
    montar({ q: "luna" });

    escribir("luna");
    act(() => void vi.advanceTimersByTime(400));

    expect(reemplazar).not.toHaveBeenCalled();
  });

  it("al elegir una década navega enseguida, conservando lo demás y volviendo a la primera página", () => {
    montar({ q: "luna", parametros: { genero: "Rock", pagina: "3" } });

    fireEvent.change(screen.getByRole("combobox", { name: "Década" }), { target: { value: "1990" } });

    expect(empujar).toHaveBeenCalledWith("/archivo?genero=Rock&q=luna&decada=1990", { scroll: false });
  });

  it("'Todas las décadas' quita la década de la dirección", () => {
    montar({ decada: "1990" });

    fireEvent.change(screen.getByRole("combobox", { name: "Década" }), { target: { value: "" } });

    expect(empujar).toHaveBeenCalledWith("/archivo", { scroll: false });
  });

  it("el orden se agrega a la dirección, salvo el de siempre (por título), que no hace falta", () => {
    montar();
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "newest" } });
    expect(empujar).toHaveBeenLastCalledWith("/archivo?orden=newest", { scroll: false });

    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar por" }), { target: { value: "title" } });
    expect(empujar).toHaveBeenLastCalledWith("/archivo", { scroll: false });
  });

  it("al enviar el formulario (Enter) busca enseguida, sin esperar", () => {
    const { container } = montar();
    escribir("candombe");

    fireEvent.submit(container.querySelector("form")!);

    expect(empujar).toHaveBeenCalledWith("/archivo?q=candombe", { scroll: false });
  });

  it("la búsqueda tiene un largo máximo", () => {
    montar();

    expect(screen.getByRole("searchbox")).toHaveAttribute("maxlength", "100");
  });
});
