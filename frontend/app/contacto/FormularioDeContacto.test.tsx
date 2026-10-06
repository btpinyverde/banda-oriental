import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
vi.mock("../lib/reportes", () => ({ enviarReporte: (...args: unknown[]) => enviar(...args) }));

import { FormularioDeContacto, MOTIVOS } from "./FormularioDeContacto";

afterEach(() => {
  cleanup();
  enviar.mockReset();
});

const poner = (etiqueta: string | RegExp, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const completar = () => {
  poner("Nombre", "Ana");
  poner("Correo electrónico", "ana@correo.com");
  poner("Motivo", MOTIVOS[1]);
  poner("Mensaje", "Se cuelga la reproducción en el celular.");
};

describe("FormularioDeContacto", () => {
  it("tiene los cuatro campos del diseño y el botón", () => {
    render(<FormularioDeContacto />);

    expect(screen.getByLabelText("Nombre")).toHaveAttribute("placeholder", "Tu nombre");
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Motivo")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Seleccioná un motivo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje")).toHaveAttribute("placeholder", "Contanos en qué podemos ayudarte...");
    expect(screen.getByRole("button", { name: /Enviar mensaje/ })).toBeInTheDocument();
  });

  it("ofrece los motivos de la página: duda, algo que no funciona, idea, artistas y titulares, y otro", () => {
    render(<FormularioDeContacto />);

    for (const motivo of MOTIVOS) expect(screen.getByRole("option", { name: motivo })).toBeInTheDocument();
    expect(MOTIVOS).toEqual(["Tengo una duda", "Algo no funciona", "Una idea o sugerencia", "Soy artista o titular de derechos", "Otro motivo"]);
  });

  it("envía como mensaje de contacto, con el motivo al principio del texto, y agradece", async () => {
    enviar.mockResolvedValue({ ok: true });
    render(<FormularioDeContacto />);

    completar();
    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/ }));

    await waitFor(() => expect(screen.getByText(/Gracias/)).toBeInTheDocument());
    expect(enviar).toHaveBeenCalledWith({
      kind: "contacto",
      name: "Ana",
      contact: "ana@correo.com",
      message: "Motivo: Algo no funciona\n\nSe cuelga la reproducción en el celular.",
      website: "",
    });
  });

  it.each([
    ["Nombre", /nombre/i],
    ["Correo electrónico", /correo/i],
    ["Motivo", /motivo/i],
    ["Mensaje", /mensaje/i],
  ])("si falta %s lo avisa y no envía", async (campo, texto) => {
    render(<FormularioDeContacto />);
    completar();
    poner(campo, "");

    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(texto);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("un correo que no parece un correo se avisa", async () => {
    render(<FormularioDeContacto />);
    completar();
    poner("Correo electrónico", "ana-sin-arroba");

    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/correo/i);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si falla muestra el motivo, no pierde lo escrito y deja reintentar", async () => {
    enviar.mockResolvedValue({ ok: false, error: "No se pudo enviar. Revisá tu conexión y probá de nuevo." });
    render(<FormularioDeContacto />);
    completar();

    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo enviar");
    expect(screen.getByLabelText("Mensaje")).toHaveValue("Se cuelga la reproducción en el celular.");
    expect(screen.getByRole("button", { name: /Enviar mensaje/ })).toBeEnabled();
  });

  it("lleva el campo escondido contra bots, fuera de la vista y de la navegación", () => {
    const { container } = render(<FormularioDeContacto />);

    const trampa = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(trampa.tabIndex).toBe(-1);
    expect(trampa.closest("[aria-hidden='true']")).not.toBeNull();
  });
});
