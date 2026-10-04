import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EsqueletoDelJuego } from "./EsqueletoDelJuego";

afterEach(cleanup);

describe("EsqueletoDelJuego", () => {
  it("muestra la forma del juego (título y las cuatro pistas bloqueadas) en vez de un hueco vacío", () => {
    render(<EsqueletoDelJuego tardando={false} />);

    expect(screen.getByRole("heading", { level: 1, name: "¿Qué canción es?" })).toBeInTheDocument();
    const pistas = within(screen.getByRole("list", { name: "Pistas" })).getAllByRole("listitem");
    expect(pistas).toHaveLength(4);
  });

  it("lleva un aviso de carga para quien usa lector de pantalla, y la zona figura como ocupada", () => {
    const { container } = render(<EsqueletoDelJuego tardando={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando la canción de hoy…");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("no ofrece nada para tocar mientras carga: ni buscador ni botones", () => {
    render(<EsqueletoDelJuego tardando={false} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("si tarda, explica que el servidor está despertando; si no, no dice nada", () => {
    const { rerender } = render(<EsqueletoDelJuego tardando={false} />);
    expect(screen.queryByText(/está despertando/)).toBeNull();

    rerender(<EsqueletoDelJuego tardando />);

    expect(screen.getByText(/está despertando/)).toBeInTheDocument();
  });

  it("el recuadro de carga es una ventana propia encima del esqueleto", () => {
    const { container } = render(<EsqueletoDelJuego tardando={false} />);

    const ventana = container.querySelector(".esqueleto__ventana");
    expect(ventana).not.toBeNull();
    expect(within(ventana as HTMLElement).getByRole("status")).toBeInTheDocument();
  });
});
