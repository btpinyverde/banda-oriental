import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { AdjuntarImagenes } from "./AdjuntarImagenes";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:vista-previa");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const archivo = (nombre: string, tipo = "image/png", bytes = 1000) => {
  const f = new File(["x"], nombre, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

function Prueba({ alCambiar }: { alCambiar?: (f: File[]) => void }) {
  const [archivos, setArchivos] = useState<File[]>([]);
  return (
    <AdjuntarImagenes
      archivos={archivos}
      alCambiar={(f) => {
        setArchivos(f);
        alCambiar?.(f);
      }}
    />
  );
}

const elegir = (...archivos: File[]) => fireEvent.change(screen.getByLabelText(/Adjuntar imágenes/), { target: { files: archivos } });

describe("AdjuntarImagenes", () => {
  it("dice que es opcional, qué se acepta y cuánto, y solo deja elegir imágenes", () => {
    render(<Prueba />);

    const entrada = screen.getByLabelText(/Adjuntar imágenes/) as HTMLInputElement;
    expect(entrada).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(entrada.multiple).toBe(true);
    expect(screen.getByText(/opcional/i)).toBeInTheDocument();
    expect(screen.getByText(/Hasta 3 imágenes de 5 MB/)).toBeInTheDocument();
  });

  it("muestra cada imagen elegida con su nombre y un botón para quitarla", () => {
    const alCambiar = vi.fn();
    const { container } = render(<Prueba alCambiar={alCambiar} />);

    elegir(archivo("captura.png"), archivo("otra.jpg", "image/jpeg"));

    expect(screen.getByText("captura.png")).toBeInTheDocument();
    expect(screen.getByText("otra.jpg")).toBeInTheDocument();
    expect(container.querySelectorAll(".adjuntar__vista")).toHaveLength(2); // una vista previa por imagen
    fireEvent.click(screen.getByRole("button", { name: "Quitar captura.png" }));
    expect(screen.queryByText("captura.png")).toBeNull();
    expect(alCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ name: "otra.jpg" })]);
  });

  it("no pasa de tres: avisa y se queda con las primeras", () => {
    render(<Prueba />);

    elegir(archivo("1.png"), archivo("2.png"), archivo("3.png"), archivo("4.png"));

    expect(screen.queryByText("4.png")).toBeNull();
    expect(screen.getByText("3.png")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/hasta 3/i);
  });

  it("rechaza lo que pesa más de 5 MB y lo que no es PNG, JPG o WEBP, y explica por qué", () => {
    render(<Prueba />);

    elegir(archivo("pesada.png", "image/png", 6 * 1024 * 1024), archivo("animada.gif", "image/gif"), archivo("ok.webp", "image/webp"));

    expect(screen.queryByText("pesada.png")).toBeNull();
    expect(screen.queryByText("animada.gif")).toBeNull();
    expect(screen.getByText("ok.webp")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/5 MB|PNG, JPG o WEBP/);
  });

  it("libera las vistas previas al quitar una imagen", () => {
    render(<Prueba />);
    elegir(archivo("a.png"));

    fireEvent.click(screen.getByRole("button", { name: "Quitar a.png" }));

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
