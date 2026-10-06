import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CancionFila } from "../lib/archivo-musical";
import { TarjetaDeCancion } from "./TarjetaDeCancion";

afterEach(cleanup);

const CANCION: CancionFila = {
  id: 5,
  title: "A las nueve",
  duration_seconds: 225,
  artist: { id: 7, name: "No Te Va Gustar" },
  album: { id: 12, name: "El camino más largo", year: 2004, genre: "Rock", cover_art_url: "https://cdn.example/tapa.jpg" },
  played_on: null,
};

describe("TarjetaDeCancion", () => {
  it("muestra la tapa del disco, el título, el artista, el año y el género", () => {
    render(<ul><TarjetaDeCancion cancion={CANCION} /></ul>);

    expect(screen.getByRole("img", { name: /Tapa de El camino más largo/ })).toHaveAttribute("src", "https://cdn.example/tapa.jpg");
    // Tocar la canción lleva al disco donde está; tocar al artista, a la lista de sus discos.
    expect(screen.getByRole("link", { name: "A las nueve" })).toHaveAttribute("href", "/archivo/disco/12-el-camino-mas-largo");
    expect(screen.getByRole("link", { name: "No Te Va Gustar" })).toHaveAttribute("href", "/archivo/discos?artista=7");
    expect(screen.getByText("El camino más largo")).toHaveClass("tarjeta__disco");
    expect(screen.getByText("2004")).toBeInTheDocument();
    expect(screen.getByText("Rock")).toHaveClass("tarjeta__genero");
  });

  it("el título es el enlace principal de la tarjeta (con CSS se estira sobre toda ella: un solo lugar donde tocar)", () => {
    const { container } = render(<ul><TarjetaDeCancion cancion={CANCION} /></ul>);

    expect(screen.getByRole("link", { name: "A las nueve" })).toHaveClass("tarjeta__enlace-principal");
    expect(container.querySelector("li.tarjeta img")).not.toBeNull();
  });

  it("si la API todavía no manda la tapa (un servidor más viejo que el sitio) no se rompe: va el bloque de color", () => {
    const sinCampo = { ...CANCION, album: { id: 12, name: "El camino más largo", year: 2004, genre: "Rock" } } as unknown as CancionFila;

    const { container } = render(<ul><TarjetaDeCancion cancion={sinCampo} /></ul>);

    expect(screen.getByRole("link", { name: "A las nueve" })).toBeInTheDocument();
    expect(container.querySelector(".tarjeta__tapa--sin")).not.toBeNull();
  });

  it("sin tapa va un bloque de color con una nota musical, nunca una imagen rota ni inventada", () => {
    const { container } = render(<ul><TarjetaDeCancion cancion={{ ...CANCION, album: { ...CANCION.album, cover_art_url: "" } }} /></ul>);

    expect(screen.queryByRole("img", { name: /Tapa de/ })).toBeNull();
    expect(container.querySelector(".tarjeta__tapa--sin .vacia__simbolo")).toHaveAttribute("src", "/assets/icon-note.svg");
  });

  it("el color del asterisco sale del lugar en la lista (las vecinas no repiten), o del id si no se da", () => {
    const sinTapa = { ...CANCION, album: { ...CANCION.album, cover_art_url: "" } };
    const { container, rerender } = render(<ul><TarjetaDeCancion cancion={sinTapa} lugar={4} /></ul>);
    expect(container.querySelector(".vacia__asterisco--tono-4")).not.toBeNull();

    rerender(<ul><TarjetaDeCancion cancion={{ ...sinTapa, id: 7 }} /></ul>);
    expect(container.querySelector(".vacia__asterisco--tono-2")).not.toBeNull();
  });

  it("si la tapa no se puede cargar, también vuelve al bloque de color", () => {
    const { container } = render(<ul><TarjetaDeCancion cancion={CANCION} /></ul>);

    fireEvent.error(screen.getByRole("img", { name: /Tapa de/ }));

    expect(screen.queryByRole("img", { name: /Tapa de/ })).toBeNull();
    expect(container.querySelector(".tarjeta__tapa--sin")).not.toBeNull();
  });

  it("solo se aceptan tapas por https", () => {
    render(<ul><TarjetaDeCancion cancion={{ ...CANCION, album: { ...CANCION.album, cover_art_url: "javascript:alert(1)" } }} /></ul>);

    expect(screen.queryByRole("img", { name: /Tapa de/ })).toBeNull();
  });

  it("sin género o sin año no deja huecos ni dice null", () => {
    const { container } = render(<ul><TarjetaDeCancion cancion={{ ...CANCION, album: { ...CANCION.album, genre: "", year: null } }} /></ul>);

    expect(container.querySelector(".tarjeta__genero")).toBeNull();
    expect(container.textContent).not.toMatch(/null|undefined/);
  });

  it("el color del género es siempre el mismo para el mismo género, sin importar mayúsculas", () => {
    const a = render(<ul><TarjetaDeCancion cancion={CANCION} /></ul>);
    const clase = a.container.querySelector(".tarjeta__genero")!.className;
    a.unmount();
    const b = render(<ul><TarjetaDeCancion cancion={{ ...CANCION, album: { ...CANCION.album, genre: "rock" } }} /></ul>);

    expect(b.container.querySelector(".tarjeta__genero")!.className).toBe(clase);
  });

  it("si la canción ya fue la del día lo dice (solo días vencidos)", () => {
    render(<ul><TarjetaDeCancion cancion={{ ...CANCION, played_on: "2026-10-02" }} /></ul>);

    expect(screen.getByRole("link", { name: /Fue la canción del día/ })).toHaveAttribute("href", "/anteriores/2026-10-02");
  });
});
