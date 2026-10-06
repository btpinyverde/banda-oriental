import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/reportes", () => ({ enviarReporte: vi.fn() }));

import Contacto, { metadata } from "./page";

afterEach(cleanup);

describe("/contacto", () => {
  it("abre con 'Hablemos.', la bajada y lo que pasa después de escribir", () => {
    render(<Contacto />);

    expect(screen.getByText("CONTACTO")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hablemos." })).toBeInTheDocument();
    expect(screen.getByText(/Una duda, un problema o una idea/)).toBeInTheDocument();
    expect(screen.getByText(/Completá el formulario y te vamos a responder lo antes posible/)).toBeInTheDocument();
  });

  it("dice qué contar si algo no funciona, en tres puntos", () => {
    render(<Contacto />);

    const tarjeta = screen.getByRole("heading", { level: 2, name: "Si algo no funciona" }).closest("section") as HTMLElement;
    expect(within(tarjeta).getByText("Para poder ayudarte rápido, contanos:")).toBeInTheDocument();
    expect(within(tarjeta).getAllByRole("listitem").map((n) => n.textContent)).toEqual([
      "Qué estabas haciendo cuando pasó.",
      "Desde qué dispositivo y navegador jugabas.",
      "Una captura de pantalla, si podés.",
    ]);
  });

  it("tiene la tarjeta de artistas y titulares de derechos", () => {
    render(<Contacto />);

    const tarjeta = screen.getByRole("heading", { level: 2, name: "Artistas y titulares de derechos" }).closest("section") as HTMLElement;
    expect(within(tarjeta).getByText(/consulta sobre una canción del juego/)).toBeInTheDocument();
  });

  it("trae el formulario, con la barra y el pie del sitio", () => {
    render(<Contacto />);

    expect(screen.getByRole("button", { name: /Enviar mensaje/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Archivo" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Términos" }).length).toBeGreaterThan(0);
  });

  it("tiene título y descripción propios, y su dirección", () => {
    expect(metadata.title).toBe("Contacto");
    expect(String(metadata.description)).toMatch(/dudas, problemas, sugerencias/);
    expect(metadata.alternates?.canonical).toBe("/contacto");
  });
});
