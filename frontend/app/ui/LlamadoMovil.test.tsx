import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LlamadoMovil } from "./LlamadoMovil";

afterEach(cleanup);

describe("LlamadoMovil", () => {
  it("invita a crear una cuenta con un enlace", () => {
    render(<LlamadoMovil />);

    expect(screen.getByRole("heading", { name: /La música también nos encuentra/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Crear cuenta gratis/ })).toHaveAttribute("href", "/login");
  });

  it("repite el sticker de las reglas sin leerlo dos veces a un lector de pantalla", () => {
    const { container } = render(<LlamadoMovil />);

    const sticker = container.querySelector(".llamado__sticker");
    expect(sticker?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
