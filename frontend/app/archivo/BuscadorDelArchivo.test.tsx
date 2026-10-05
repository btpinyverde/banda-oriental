import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import * as datos from "../lib/archivo-musical";
import type { Busqueda } from "../lib/archivo-musical";
import { BuscadorDelArchivo } from "./BuscadorDelArchivo";

const vacio = { results: [], total: 0 };
const busqueda = (extra: Partial<Busqueda> = {}): Busqueda => ({ q: "luna", artists: vacio, albums: vacio, songs: vacio, ...extra });
const CANCION = {
  id: 5,
  title: "Luna negra",
  duration_seconds: 225,
  artist: { id: 7, name: "Jorge Drexler" },
  album: { id: 12, name: "Vaivén", year: 1996, genre: "Folk" },
  played_on: null,
};

let buscar: MockInstance<typeof datos.buscarEnElArchivo>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  buscar = vi.spyOn(datos, "buscarEnElArchivo").mockResolvedValue(busqueda());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const escribir = async (texto: string) => {
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en el archivo" }), { target: { value: texto } });
  await act(async () => void vi.advanceTimersByTime(300));
};

describe("BuscadorDelArchivo", () => {
  it("es una búsqueda de verdad, también sin JavaScript: un formulario que lleva a la lista de canciones", () => {
    const { container } = render(<BuscadorDelArchivo />);

    const formulario = container.querySelector("form")!;
    expect(formulario).toHaveAttribute("action", "/archivo/canciones");
    expect(formulario).toHaveAttribute("method", "get");
    expect(screen.getByRole("searchbox", { name: "Buscar en el archivo" })).toHaveAttribute("name", "q");
  });

  it("con una sola letra no busca todavía y lo explica", async () => {
    render(<BuscadorDelArchivo />);

    await escribir("l");

    expect(buscar).not.toHaveBeenCalled();
    expect(screen.getByText(/al menos 2 letras/i)).toBeInTheDocument();
  });

  it("espera a que se deje de escribir: una sola búsqueda, no una por letra", async () => {
    render(<BuscadorDelArchivo />);

    for (const texto of ["lu", "lun", "luna"]) fireEvent.change(screen.getByRole("searchbox"), { target: { value: texto } });
    await act(async () => void vi.advanceTimersByTime(300));

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0][0]).toBe("luna");
  });

  it("muestra los resultados agrupados, cada canción con artista, disco, año y duración, y todo enlaza a su ficha", async () => {
    buscar.mockResolvedValue(
      busqueda({
        artists: { results: [{ id: 7, name: "Jorge Drexler", albums: 2, songs: 3, first_year: 1996, last_year: 2004, cover_art_url: "" }], total: 1 },
        albums: { results: [{ id: 12, name: "Vaivén", artist: { id: 7, name: "Jorge Drexler" }, year: 1996, genre: "Folk", release_type: "album", songs: 2, cover_art_url: "" }], total: 1 },
        songs: { results: [CANCION], total: 1 },
      }),
    );
    render(<BuscadorDelArchivo />);

    await escribir("drexler");

    const artistas = screen.getByRole("region", { name: "Artistas" });
    expect(within(artistas).getByRole("link", { name: /Jorge Drexler/ })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    const discos = screen.getByRole("region", { name: "Discos" });
    expect(within(discos).getByRole("link", { name: /Vaivén/ })).toHaveAttribute("href", "/archivo/disco/12-vaiven");
    const canciones = screen.getByRole("region", { name: "Canciones" });
    const enlace = within(canciones).getByRole("link", { name: /Luna negra/ });
    expect(enlace).toHaveAttribute("href", "/archivo/cancion/5-luna-negra");
    expect(canciones).toHaveTextContent("Jorge Drexler");
    expect(canciones).toHaveTextContent("Vaivén");
    expect(canciones).toHaveTextContent("1996");
    expect(canciones).toHaveTextContent("3:45");
  });

  it("si hay más resultados de los que se muestran, ofrece ver todos con la misma búsqueda", async () => {
    buscar.mockResolvedValue(busqueda({ songs: { results: [CANCION], total: 17 } }));
    render(<BuscadorDelArchivo />);

    await escribir("luna negra");

    expect(screen.getByRole("link", { name: /Ver las 17 canciones/ })).toHaveAttribute("href", "/archivo/canciones?q=luna+negra");
  });

  it("un grupo sin resultados no se muestra", async () => {
    buscar.mockResolvedValue(busqueda({ songs: { results: [CANCION], total: 1 } }));
    render(<BuscadorDelArchivo />);

    await escribir("luna");

    expect(screen.queryByRole("region", { name: "Artistas" })).toBeNull();
    expect(screen.getByRole("region", { name: "Canciones" })).toBeInTheDocument();
  });

  it("si no hay nada lo dice con las palabras buscadas", async () => {
    render(<BuscadorDelArchivo />);

    await escribir("zzzz");

    expect(screen.getByText(/No encontramos nada para «zzzz»/)).toBeInTheDocument();
  });

  it("avisa que está buscando, y si la API falla lo dice y deja reintentar", async () => {
    let fallar = true;
    buscar.mockImplementation(async () => {
      if (fallar) throw new Error("sin red");
      return busqueda({ songs: { results: [CANCION], total: 1 } });
    });
    render(<BuscadorDelArchivo />);

    await escribir("luna");
    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos buscar/);

    fallar = false;
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(async () => void vi.advanceTimersByTime(300));
    expect(screen.getByRole("link", { name: /Luna negra/ })).toBeInTheDocument();
  });

  it("la respuesta de una búsqueda vieja no pisa a la nueva (y la vieja se cancela)", async () => {
    const señales: AbortSignal[] = [];
    let responderVieja!: (b: Busqueda) => void;
    buscar.mockImplementationOnce((_q, opciones) => {
      señales.push(opciones!.senial!);
      return new Promise((resolver) => (responderVieja = resolver));
    });
    buscar.mockResolvedValueOnce(busqueda({ q: "dos", songs: { results: [{ ...CANCION, title: "Dos" }], total: 1 } }));
    render(<BuscadorDelArchivo />);

    await escribir("uno");
    await escribir("dos");
    await act(async () => responderVieja(busqueda({ q: "uno", songs: { results: [{ ...CANCION, title: "Uno" }], total: 1 } })));

    expect(señales[0].aborted).toBe(true);
    expect(screen.getByRole("link", { name: /Dos/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Uno/ })).toBeNull();
  });

  it("al borrar lo escrito se limpian los resultados", async () => {
    buscar.mockResolvedValue(busqueda({ songs: { results: [CANCION], total: 1 } }));
    render(<BuscadorDelArchivo />);
    await escribir("luna");

    await escribir("");

    expect(screen.queryByRole("link", { name: /Luna negra/ })).toBeNull();
  });

  it("los resultados se anuncian a los lectores de pantalla", async () => {
    buscar.mockResolvedValue(busqueda({ songs: { results: [CANCION], total: 1 } }));
    render(<BuscadorDelArchivo />);

    await escribir("luna");

    expect(screen.getByRole("status")).toHaveTextContent(/1 resultado/);
  });
});
