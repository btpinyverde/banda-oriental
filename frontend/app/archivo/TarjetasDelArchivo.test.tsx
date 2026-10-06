import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ArtistaFila, DiscoFila } from "../lib/archivo-musical";
import { TarjetaDeArtista, TarjetaDeDisco } from "./TarjetasDelArchivo";

afterEach(cleanup);

const ARTISTA: ArtistaFila = { id: 7, name: "Jorge Drexler", albums: 2, songs: 1, first_year: 2004, last_year: 2004, cover_art_url: "", picture_url: "" };
const DISCO: DiscoFila = { id: 12, name: "Vaivén", artist: { id: 7, name: "Jorge Drexler" }, year: 1996, genre: "Folk", release_type: "album", songs: 12, cover_art_url: "https://cdn.example/t.jpg" };

describe("TarjetaDeArtista", () => {
  it("lleva a la ficha, con las canciones (en singular si es una) y el año único", () => {
    render(<ul><TarjetaDeArtista artista={ARTISTA} lugar={0} /></ul>);

    expect(screen.getByRole("link", { name: /Jorge Drexler/ })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(screen.getByText("1 canción")).toBeInTheDocument();
    expect(screen.getByText("2004")).toBeInTheDocument();
  });

  it("sin foto va el bloque de papel con el vinilo y el color que toca por su lugar; con foto de Deezer la muestra", () => {
    const { container, rerender } = render(<ul><TarjetaDeArtista artista={ARTISTA} lugar={3} /></ul>);
    expect(container.querySelector(".tarjeta__tapa--vacia .vacia__simbolo")).toHaveAttribute("src", "/assets/vinilo.svg");
    expect(container.querySelector(".vacia__asterisco--tono-3")).not.toBeNull();
    expect(container.querySelector(".artista__inicial")).toBeNull();

    rerender(<ul><TarjetaDeArtista artista={{ ...ARTISTA, picture_url: "https://cdn.example/d.jpg" }} lugar={3} /></ul>);
    expect(screen.getByRole("img", { name: "Foto de Jorge Drexler" })).toHaveAttribute("src", "https://cdn.example/d.jpg");
  });
});

describe("TarjetaDeDisco", () => {
  it("muestra la tapa, el nombre (enlace principal), el artista, el año, las canciones y el género", () => {
    render(<ul><TarjetaDeDisco disco={DISCO} lugar={0} /></ul>);

    expect(screen.getByRole("img", { name: "Tapa de Vaivén" })).toHaveAttribute("src", "https://cdn.example/t.jpg");
    expect(screen.getByRole("link", { name: "Vaivén" })).toHaveAttribute("href", "/archivo/disco/12-vaiven");
    expect(screen.getByRole("link", { name: "Vaivén" })).toHaveClass("tarjeta__enlace-principal");
    expect(screen.getByRole("link", { name: "Jorge Drexler" })).toHaveAttribute("href", "/archivo/artista/7-jorge-drexler");
    expect(screen.getByText("1996")).toBeInTheDocument();
    expect(screen.getByText("12 canciones")).toBeInTheDocument();
    expect(screen.getByText("Folk")).toHaveClass("tarjeta__genero");
  });

  it("sin tapa va el bloque de papel con el vinilo, nunca una imagen inventada", () => {
    const { container } = render(<ul><TarjetaDeDisco disco={{ ...DISCO, cover_art_url: "" }} lugar={2} /></ul>);

    expect(screen.queryByRole("img", { name: /Tapa/ })).toBeNull();
    expect(container.querySelector(".tarjeta__tapa--sin .vacia__simbolo")).toHaveAttribute("src", "/assets/vinilo.svg");
    expect(container.querySelector(".vacia__asterisco--tono-2")).not.toBeNull();
  });
});
