import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CabeceraDeArtista } from "./CabeceraDeArtista";

afterEach(cleanup);

const base = { id: 7, nombre: "Jorge Drexler", discos: 1, canciones: 1, anios: "2004" };

describe("CabeceraDeArtista", () => {
  it("dice quién es y cuánto tiene, en singular cuando es uno", () => {
    render(<CabeceraDeArtista {...base} />);

    expect(screen.getByRole("heading", { level: 1, name: "Jorge Drexler" })).toBeInTheDocument();
    expect(screen.getByText("1 disco")).toBeInTheDocument();
    expect(screen.getByText("1 canción")).toBeInTheDocument();
    expect(screen.getByText("2004")).toBeInTheDocument();
  });

  it("sin cantidad o sin años no deja huecos ni dice null", () => {
    render(<CabeceraDeArtista {...base} canciones={null} anios="" />);

    expect(screen.queryByText(/^\d+ canci/)).toBeNull();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it("la foto recortada va entera sobre el color; la de Deezer se muestra; sin ninguna va el papel con el vinilo", () => {
    const { container, rerender } = render(<CabeceraDeArtista {...base} recorte="https://x/r.webp" foto="https://x/d.jpg" />);
    expect(screen.getByRole("img", { name: "Foto de Jorge Drexler" })).toHaveAttribute("src", "https://x/r.webp");
    expect(container.querySelector(".artista__foto--recorte")).not.toBeNull();

    rerender(<CabeceraDeArtista {...base} foto="https://x/d.jpg" />);
    expect(screen.getByRole("img", { name: "Foto de Jorge Drexler" })).toHaveAttribute("src", "https://x/d.jpg");

    rerender(<CabeceraDeArtista {...base} />);
    expect(container.querySelector(".vacia__simbolo")).toHaveAttribute("src", "/assets/vinilo.svg");
  });

  it("ofrece avisar de un error de ese artista, con quién es en la dirección", () => {
    render(<CabeceraDeArtista {...base} nombre="Fernando Cabrera" id={262} />);

    const enlace = screen.getByRole("link", { name: /Algo no está bien/ });
    const url = new URL(enlace.getAttribute("href")!, "https://x.test");
    expect(url.pathname).toBe("/archivo/reportar");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tipo: "artista", id: "262", nombre: "Fernando Cabrera" });
  });
});
