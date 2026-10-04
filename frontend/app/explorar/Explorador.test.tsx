import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoDelCatalogo, GrupoDeDiscos } from "../lib/catalogo";
import { Explorador } from "./Explorador";

afterEach(cleanup);

const disco = (artista: string, nombre: string, anio: number | null = 1990, canciones = 10): DiscoDelCatalogo => ({ artista, disco: nombre, anio, genero: "", canciones });
const grupo = (etiqueta: string, discos: DiscoDelCatalogo[]): GrupoDeDiscos => ({ clave: etiqueta, etiqueta, discos });

describe("Explorador", () => {
  it("muestra cada grupo con la cantidad de discos y, al abrirlo, los discos con su año y sus canciones", () => {
    render(<Explorador grupos={[grupo("Jorge Drexler", [disco("Jorge Drexler", "Vaivén", 1996, 12)])]} />);

    const resumen = screen.getByText(/Jorge Drexler/, { selector: "summary *, summary" });
    expect(resumen.closest("summary")).toHaveTextContent("1 disco");
    const detalle = resumen.closest("details") as HTMLElement;
    const fila = within(detalle).getByRole("listitem");
    expect(fila).toHaveTextContent("Vaivén (1996)");
    expect(fila).toHaveTextContent("12 canciones");
  });

  it("escribe en singular y plural: 1 disco, 2 discos; 1 canción, 2 canciones", () => {
    render(<Explorador grupos={[grupo("X", [disco("X", "A", 1990, 1), disco("X", "B", 1991, 2)])]} />);

    expect(screen.getByText(/2 discos/)).toBeInTheDocument();
    const [primera, segunda] = screen.getAllByRole("listitem");
    expect(primera).toHaveTextContent("1 canción");
    expect(primera).not.toHaveTextContent("1 canciones");
    expect(segunda).toHaveTextContent("2 canciones");
  });

  it("con `conArtista` muestra de quién es cada disco (para épocas y géneros)", () => {
    render(<Explorador conArtista grupos={[grupo("Años 1990", [disco("Rubén Rada", "Montevideo", 1990)])]} />);

    expect(screen.getByRole("listitem")).toHaveTextContent("Montevideo (1990) · Rubén Rada");
  });

  it("un disco sin año no inventa uno", () => {
    render(<Explorador grupos={[grupo("X", [disco("X", "Sin fecha", null)])]} />);

    expect(screen.getByRole("listitem")).toHaveTextContent(/^Sin fecha ·/);
    expect(screen.getByRole("listitem")).not.toHaveTextContent(/null|undefined|\(/);
  });

  describe("buscador", () => {
    const grupos = [grupo("Álvaro Pintos", [disco("Álvaro Pintos", "A")]), grupo("Rubén Rada", [disco("Rubén Rada", "B")]), grupo("Jorge Drexler", [disco("Jorge Drexler", "C")])];

    it("filtra por el nombre del grupo sin distinguir tildes ni mayúsculas", () => {
      render(<Explorador buscable grupos={grupos} />);

      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ruben" } });

      expect(screen.getByText(/Rubén Rada/)).toBeInTheDocument();
      expect(screen.queryByText(/Álvaro Pintos/)).toBeNull();
    });

    it("si no hay resultados lo dice con lo que se buscó", () => {
      render(<Explorador buscable grupos={grupos} />);

      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });

      expect(screen.getByText(/No encontramos nada para “zzz”/)).toBeInTheDocument();
    });

    it("no aparece si no se pide", () => {
      render(<Explorador grupos={grupos} />);

      expect(screen.queryByRole("searchbox")).toBeNull();
    });
  });

  describe("muchos grupos", () => {
    const muchos = Array.from({ length: 95 }, (_, i) => grupo(`Artista ${String(i).padStart(2, "0")}`, [disco("x", "d")]));

    it("muestra los primeros 40 y deja pedir más de a 40, sin abrumar la página", () => {
      render(<Explorador grupos={muchos} />);
      expect(screen.getAllByRole("group")).toHaveLength(40);

      fireEvent.click(screen.getByRole("button", { name: "Mostrar más" }));
      expect(screen.getAllByRole("group")).toHaveLength(80);

      fireEvent.click(screen.getByRole("button", { name: "Mostrar más" }));
      expect(screen.getAllByRole("group")).toHaveLength(95);
      expect(screen.queryByRole("button", { name: "Mostrar más" })).toBeNull();
    });

    it("al buscar se busca en todos, no solo en los que están a la vista", () => {
      render(<Explorador buscable grupos={muchos} />);

      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Artista 90" } });

      expect(screen.getByText(/Artista 90/)).toBeInTheDocument();
    });
  });

  it("sin grupos avisa que no hay nada para mostrar", () => {
    render(<Explorador grupos={[]} vacio="Todavía no hay artistas cargados." />);

    expect(screen.getByText("Todavía no hay artistas cargados.")).toBeInTheDocument();
  });
});
