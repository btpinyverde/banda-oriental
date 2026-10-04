import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuscadorCanciones } from "./BuscadorCanciones";
import type { CancionCatalogo } from "../lib/juego/tipos";

afterEach(cleanup);

const cancion = (id: number, title: string, artist: string): CancionCatalogo => ({ id, title, artist, album: "Disco", year: 2000, genre: "Rock" });

const CANCIONES = [
  cancion(1, "A las nueve", "No Te Va Gustar"),
  cancion(2, "Sin saber", "No Te Va Gustar"),
  cancion(3, "Cuando sea grande", "El Cuarteto de Nos"),
  cancion(4, "Candombe para Gardel", "Rubén Rada"),
];

function montar(extra: Partial<Parameters<typeof BuscadorCanciones>[0]> = {}) {
  const alEnviar = vi.fn();
  render(<BuscadorCanciones canciones={CANCIONES} puedeEnviar alEnviar={alEnviar} {...extra} />);
  return { alEnviar, campo: screen.getByRole("combobox") as HTMLInputElement };
}

/** Simula llegar al final de la lista con scroll (jsdom no calcula medidas, hay que fijarlas). */
function alFinalDelScroll(lista: HTMLElement, medidas: { scrollTop?: number } = {}) {
  Object.defineProperty(lista, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(lista, "clientHeight", { configurable: true, value: 300 });
  Object.defineProperty(lista, "scrollTop", { configurable: true, value: medidas.scrollTop ?? 700 });
  fireEvent.scroll(lista);
}

const escribir = (campo: HTMLElement, texto: string) => fireEvent.change(campo, { target: { value: texto } });
const enviar = () => screen.getByRole("button", { name: "Enviar intento" });

describe("BuscadorCanciones", () => {
  it("no muestra la lista hasta que se enfoca el campo", () => {
    montar();

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("enfocar el campo sin escribir no muestra nada", () => {
    const { campo } = montar();

    fireEvent.focus(campo);
    fireEvent.click(campo);

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("borrar lo escrito cierra la lista en vez de mostrar el catálogo", () => {
    const { campo } = montar();

    escribir(campo, "candombe");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    escribir(campo, "");

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("la lista se cierra cuando el campo pierde el foco, pero elegir una opción con el mouse sigue andando", () => {
    const { campo } = montar();

    escribir(campo, "sin sa");
    fireEvent.blur(campo);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.focus(campo);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    // Tocar una opción no le quita el foco al campo (mousedown se cancela): se elige antes de cerrar.
    const opcion = screen.getByRole("option", { name: /Sin saber/ });
    expect(fireEvent.mouseDown(opcion)).toBe(false);
    fireEvent.click(opcion);
    expect(campo.value).toBe("Sin saber");
  });

  it("escribir solo espacios tampoco muestra nada", () => {
    const { campo } = montar();

    escribir(campo, "   ");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si el campo ya tenía el foco y la lista estaba cerrada, un clic la vuelve a abrir", () => {
    const { campo } = montar();

    escribir(campo, "candombe");
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(campo);

    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("busca por título sin importar mayúsculas ni tildes", () => {
    const { campo } = montar();

    escribir(campo, "CANDOMBE");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Candombe para Gardel")]);

    escribir(campo, "ruben");
    expect(screen.getByRole("option")).toHaveTextContent("Candombe para Gardel");
  });

  it("también busca por artista", () => {
    const { campo } = montar();

    escribir(campo, "no te va");

    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("muestra una primera tanda de 30 y sigue cargando más al llegar al final del scroll", () => {
    const muchas = Array.from({ length: 70 }, (_, i) => cancion(i + 1, `Tema ${i + 1}`, "Artista"));
    const { campo } = montar({ canciones: muchas });

    escribir(campo, "artista");
    expect(screen.getAllByRole("option")).toHaveLength(30);

    alFinalDelScroll(screen.getByRole("listbox"));
    expect(screen.getAllByRole("option")).toHaveLength(60);

    alFinalDelScroll(screen.getByRole("listbox"));
    expect(screen.getAllByRole("option")).toHaveLength(70);
  });

  it("no carga más mientras el scroll todavía está lejos del final", () => {
    const muchas = Array.from({ length: 70 }, (_, i) => cancion(i + 1, `Tema ${i + 1}`, "Artista"));
    const { campo } = montar({ canciones: muchas });

    escribir(campo, "artista");
    alFinalDelScroll(screen.getByRole("listbox"), { scrollTop: 0 });

    expect(screen.getAllByRole("option")).toHaveLength(30);
  });

  it("una búsqueda nueva vuelve a empezar desde la primera tanda", () => {
    const muchas = Array.from({ length: 70 }, (_, i) => cancion(i + 1, `Tema ${i + 1}`, "Artista"));
    const { campo } = montar({ canciones: muchas });

    escribir(campo, "artista");
    alFinalDelScroll(screen.getByRole("listbox"));
    escribir(campo, "tema");

    expect(screen.getAllByRole("option")).toHaveLength(30);
  });

  it("con el teclado, al pasar la última opción cargada se cargan más y se sigue bajando", () => {
    const muchas = Array.from({ length: 70 }, (_, i) => cancion(i + 1, `Tema ${i + 1}`, "Artista"));
    const { campo } = montar({ canciones: muchas });

    escribir(campo, "artista");
    for (let i = 0; i < 31; i++) fireEvent.keyDown(campo, { key: "ArrowDown" });

    expect(screen.getAllByRole("option")).toHaveLength(60);
    expect(campo).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[30].id);
  });

  it("ordena las coincidencias por artista, luego por disco (por año) y luego por título", () => {
    const disco = (id: number, title: string, album: string, year: number) => ({ ...cancion(id, title, "Artista"), album, year });
    const { campo } = montar({
      canciones: [disco(1, "Beta", "Segundo disco", 2010), disco(2, "Alfa", "Segundo disco", 2010), disco(3, "Zeta", "Primer disco", 2001)],
    });

    escribir(campo, "artista");

    expect(screen.getAllByRole("option").map((o) => o.querySelector(".buscador__titulo")?.textContent)).toEqual([
      "Zeta",
      "Alfa",
      "Beta",
    ]);
  });

  it("al buscar un disco muestra todas sus canciones", () => {
    const { campo } = montar({
      canciones: [
        { ...cancion(1, "Uno", "A"), album: "Eco" },
        { ...cancion(2, "Dos", "A"), album: "Eco" },
        { ...cancion(3, "Tres", "A"), album: "Otro" },
      ],
    });

    escribir(campo, "eco");

    expect(screen.getAllByRole("option").map((o) => o.querySelector(".buscador__titulo")?.textContent)).toEqual(["Dos", "Uno"]);
  });

  it("al moverse con el teclado lleva la opción activa a la vista dentro de la lista", () => {
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    const { campo } = montar();

    escribir(campo, "no te va");
    fireEvent.keyDown(campo, { key: "ArrowDown" });

    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("avisa cuando nada coincide", () => {
    const { campo } = montar();

    escribir(campo, "zzzz");

    expect(screen.getByRole("status")).toHaveTextContent("No encontramos esa canción");
  });

  it("al elegir una opción completa el campo y habilita enviar", () => {
    const { campo } = montar();
    expect(enviar()).toBeDisabled();

    escribir(campo, "sin sa");
    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));

    expect(campo.value).toBe("Sin saber");
    expect(enviar()).toBeEnabled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("no permite enviar mientras no se pueda (el audio no sonó) aunque haya una canción elegida", () => {
    const { campo } = montar({ puedeEnviar: false });

    escribir(campo, "sin sa");
    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));

    expect(enviar()).toBeDisabled();
  });

  it("al enviar entrega la canción elegida y limpia el campo", () => {
    const { campo, alEnviar } = montar();

    escribir(campo, "sin sa");
    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));
    fireEvent.click(enviar());

    expect(alEnviar).toHaveBeenCalledWith(CANCIONES[1]);
    expect(campo.value).toBe("");
    expect(enviar()).toBeDisabled();
  });

  it("editar el texto después de elegir invalida la elección", () => {
    const { campo } = montar();

    escribir(campo, "sin sa");
    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));
    escribir(campo, "Sin sabe");

    expect(enviar()).toBeDisabled();
  });

  it("se maneja con el teclado: flechas para moverse y Enter para elegir", () => {
    const { campo } = montar();

    escribir(campo, "no te va");
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    expect(campo).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id);

    fireEvent.keyDown(campo, { key: "Enter" });

    expect(campo.value).toBe("Sin saber");
  });

  it("Escape cierra la lista sin borrar lo escrito", () => {
    const { campo } = montar();

    escribir(campo, "no te va");
    fireEvent.keyDown(campo, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(campo.value).toBe("no te va");
  });

  it("mientras se envía bloquea el botón", () => {
    const { campo } = montar({ enviando: true });

    escribir(campo, "sin sa");
    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));

    expect(enviar()).toBeDisabled();
  });

  it("en cada opción muestra el artista, el disco y el año", () => {
    const { campo } = montar();

    escribir(campo, "candombe");

    const opcion = screen.getByRole("option");
    expect(opcion).toHaveTextContent("Candombe para Gardel");
    expect(opcion).toHaveTextContent("Rubén Rada · Disco · 2000");
  });

  it("omite el año cuando no se conoce y no deja separadores sueltos", () => {
    const { campo } = montar({ canciones: [{ ...CANCIONES[3], year: null, album: "" }] });

    escribir(campo, "candombe");

    expect(screen.getByRole("option")).toHaveTextContent(/^Candombe para GardelRubén Rada$/);
  });
});
