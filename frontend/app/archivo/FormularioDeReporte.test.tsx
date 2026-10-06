import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
vi.mock("../lib/reportes", () => ({ enviarReporte: (...args: unknown[]) => enviar(...args) }));

import { FormularioDeReporte } from "./FormularioDeReporte";

afterEach(() => {
  cleanup();
  enviar.mockReset();
});

const escribir = (nombre: string | RegExp, valor: string) => fireEvent.change(screen.getByLabelText(nombre), { target: { value: valor } });

describe("FormularioDeReporte: algo está mal", () => {
  const montar = () => render(<FormularioDeReporte tipo="error" objetivo={{ tipo: "artist", id: 7, nombre: "Fernando Cabrera" }} />);

  it("dice sobre qué es el reporte y pide que cuente qué está mal", () => {
    montar();

    expect(screen.getByText("Fernando Cabrera")).toBeInTheDocument();
    expect(screen.getByLabelText(/Qué está mal/)).toBeRequired();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });

  it("envía lo escrito con a qué artista se refiere, y agradece", async () => {
    enviar.mockResolvedValue({ ok: true });
    montar();

    escribir(/Qué está mal/, "Tiene discos de otro Fernando Cabrera.");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText(/Gracias/)).toBeInTheDocument());
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ kind: "error", target_type: "artist", target_id: 7, target_label: "Fernando Cabrera", message: "Tiene discos de otro Fernando Cabrera.", website: "" }), []);
  });

  it("no envía un mensaje vacío y lo avisa", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Contanos qué está mal/);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("mientras envía no se puede apretar de nuevo, y si falla muestra el motivo y deja reintentar", async () => {
    enviar.mockResolvedValue({ ok: false, error: "Demasiados pedidos seguidos. Esperá un momento y probá de nuevo." });
    montar();
    escribir(/Qué está mal/, "Algo no cierra.");

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Demasiados pedidos seguidos");
    expect(screen.getByLabelText(/Qué está mal/)).toHaveValue("Algo no cierra."); // no pierde lo escrito
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("el campo escondido contra bots existe, está fuera de la vista y de la navegación", () => {
    const { container } = montar();

    const trampa = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trampa).not.toBeNull();
    expect(trampa.tabIndex).toBe(-1);
    expect(trampa.closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("FormularioDeReporte: sumar un artista", () => {
  it("pide nombre y cómo contactarte, con enlaces y un mensaje opcionales", async () => {
    enviar.mockResolvedValue({ ok: true });
    render(<FormularioDeReporte tipo="alta" />);

    expect(screen.getByLabelText(/Nombre del artista o banda/)).toBeRequired();
    expect(screen.getByLabelText(/Cómo te contactamos/)).toBeRequired();
    escribir(/Nombre del artista o banda/, "Los Nadie");
    escribir(/Cómo te contactamos/, "@losnadie");
    escribir(/Enlaces/, "https://open.spotify.com/artist/xyz");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText(/Gracias/)).toBeInTheDocument());
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ kind: "alta", name: "Los Nadie", contact: "@losnadie", links: "https://open.spotify.com/artist/xyz" }), []);
  });

  it("sin nombre o sin contacto no envía", async () => {
    render(<FormularioDeReporte tipo="alta" />);

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/nombre/i);
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("FormularioDeReporte: imágenes", () => {
  it("al avisar de un error también se puede adjuntar una captura", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    enviar.mockResolvedValue({ ok: true });
    render(<FormularioDeReporte tipo="error" objetivo={{ tipo: "artist", id: 7, nombre: "Fernando Cabrera" }} />);
    const captura = new File(["x"], "pagina.png", { type: "image/png" });

    escribir(/Qué está mal/, "Tiene discos de otro artista.");
    fireEvent.change(screen.getByLabelText(/Adjuntar imágenes/), { target: { files: [captura] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText(/Gracias/)).toBeInTheDocument());
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ kind: "error", target_id: 7 }), [captura]);
  });

  it("sumar un artista no pide imágenes (se explica con enlaces)", () => {
    render(<FormularioDeReporte tipo="alta" />);

    expect(screen.queryByLabelText(/Adjuntar imágenes/)).toBeNull();
  });
});
