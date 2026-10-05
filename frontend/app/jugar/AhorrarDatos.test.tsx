import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AhorrarDatos } from "./AhorrarDatos";

afterEach(cleanup);

describe("AhorrarDatos", () => {
  it("es un interruptor con nombre claro y explica qué hace", () => {
    render(<AhorrarDatos activo={false} alCambiar={vi.fn()} />);

    const interruptor = screen.getByRole("checkbox", { name: "Ahorrar datos" });
    expect(interruptor).not.toBeChecked();
    expect(screen.getByText(/audio más liviano/i)).toBeInTheDocument();
  });

  it("muestra cuándo está activo", () => {
    render(<AhorrarDatos activo alCambiar={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Ahorrar datos" })).toBeChecked();
  });

  it("avisa lo que se eligió", () => {
    const alCambiar = vi.fn();
    render(<AhorrarDatos activo={false} alCambiar={alCambiar} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Ahorrar datos" }));

    expect(alCambiar).toHaveBeenCalledWith(true);
  });
});
