import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CambiarNombre } from "./CambiarNombre";

afterEach(cleanup);

const abrir = () => fireEvent.click(screen.getByText("Cambiar mi nombre"));

function montar(alCambiar = vi.fn().mockResolvedValue(undefined)) {
  render(<CambiarNombre nombreActual="Ana" alCambiar={alCambiar} />);
  return { alCambiar };
}

describe("CambiarNombre", () => {
  it("arranca cerrado y, al abrirlo, muestra el nombre actual para editarlo", () => {
    montar();
    abrir();

    expect(screen.getByLabelText("Tu nombre en el ranking")).toHaveValue("Ana");
  });

  it("envía el nombre nuevo sin espacios sobrantes y confirma con el nombre con el que aparece", async () => {
    const { alCambiar } = montar();
    abrir();

    fireEvent.change(screen.getByLabelText("Tu nombre en el ranking"), { target: { value: "  Anita " } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar" })));

    expect(alCambiar).toHaveBeenCalledWith("Anita");
    expect(screen.getByRole("status")).toHaveTextContent(/Anita/);
  });

  it("no envía un nombre vacío ni igual al actual, y lo explica", async () => {
    const { alCambiar } = montar();
    abrir();

    fireEvent.change(screen.getByLabelText("Tu nombre en el ranking"), { target: { value: "   " } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar" })));
    expect(screen.getByRole("alert")).toHaveTextContent(/Escribí un nombre/);

    fireEvent.change(screen.getByLabelText("Tu nombre en el ranking"), { target: { value: "Ana" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar" })));
    expect(screen.getByRole("alert")).toHaveTextContent(/Es el mismo nombre/);
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("muestra tal cual el mensaje del servidor si lo rechaza (en uso, tenés que esperar...) y deja volver a intentar", async () => {
    const { alCambiar } = montar();
    alCambiar.mockRejectedValueOnce(new Error("Ese nombre ya está en uso. Elegí otro."));
    abrir();

    fireEvent.change(screen.getByLabelText("Tu nombre en el ranking"), { target: { value: "Beto" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar" })));

    expect(screen.getByRole("alert")).toHaveTextContent("Ese nombre ya está en uso. Elegí otro.");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("bloquea el botón mientras guarda", async () => {
    let terminar!: () => void;
    montar(vi.fn(() => new Promise<void>((resolver) => (terminar = resolver))));
    abrir();

    fireEvent.change(screen.getByLabelText("Tu nombre en el ranking"), { target: { value: "Anita" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar" })));

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    await act(async () => terminar());
  });
});
