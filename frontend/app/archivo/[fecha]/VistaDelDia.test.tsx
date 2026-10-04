import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DetalleDelDia } from "../../lib/archivo";
import { VistaDelDia } from "./VistaDelDia";

afterEach(cleanup);

const detalle = (cambios: Partial<DetalleDelDia> = {}): DetalleDelDia => ({
  date: "2026-10-02",
  song_title: "Luna negra",
  artist: "Jorge Drexler",
  album: "Vaivén",
  artist_instagram_handle: "",
  ...cambios,
});

describe("VistaDelDia", () => {
  it("muestra la canción, el artista, el disco y la fecha del día", () => {
    render(<VistaDelDia dia={detalle()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Luna negra" })).toBeInTheDocument();
    expect(screen.getByText("Jorge Drexler")).toBeInTheDocument();
    expect(screen.getByText("Vaivén")).toBeInTheDocument();
    expect(screen.getByText(/viernes 2 de octubre de 2026/)).toBeInTheDocument();
  });

  it("enlaza al Instagram del artista cuando se cargó (sin la arroba) y abre en otra pestaña de forma segura", () => {
    render(<VistaDelDia dia={detalle({ artist_instagram_handle: "@jorgedrexler" })} />);

    const enlace = screen.getByRole("link", { name: /Instagram/ });
    expect(enlace).toHaveAttribute("href", "https://www.instagram.com/jorgedrexler/");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("no inventa un enlace si no hay usuario de Instagram, ni si el dato trae caracteres raros", () => {
    const { rerender } = render(<VistaDelDia dia={detalle({ artist_instagram_handle: "" })} />);
    expect(screen.queryByRole("link", { name: /Instagram/ })).toBeNull();

    rerender(<VistaDelDia dia={detalle({ artist_instagram_handle: "x/../evil?y=1" })} />);
    expect(screen.queryByRole("link", { name: /Instagram/ })).toBeNull();
  });

  it("lleva de vuelta al archivo y a jugar el diario", () => {
    render(<VistaDelDia dia={detalle()} />);

    expect(screen.getByRole("link", { name: /Volver al archivo/ })).toHaveAttribute("href", "/archivo");
    expect(screen.getByRole("link", { name: /Jugar el diario/ })).toHaveAttribute("href", "/jugar");
  });
});
