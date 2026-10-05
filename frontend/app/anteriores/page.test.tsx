import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as archivo from "../lib/anteriores";
import PaginaAnteriores, { metadata } from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/anteriores", () => {
  it("se arma en el servidor con los días de la API", async () => {
    vi.spyOn(archivo, "obtenerDias").mockResolvedValue([{ date: "2026-10-02", song_title: "Luna negra", artist: "Jorge Drexler" }]);

    render(await PaginaAnteriores());

    expect(screen.getByRole("link", { name: /Luna negra/ })).toHaveAttribute("href", "/anteriores/2026-10-02");
    expect(screen.getByRole("link", { name: "Ranking" })).toBeInTheDocument(); // la barra del sitio
  });

  it("si la API no responde la página igual carga y lo explica", async () => {
    vi.spyOn(archivo, "obtenerDias").mockResolvedValue(null);

    render(await PaginaAnteriores());

    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar los juegos anteriores/);
  });

  it("es una página para indexar, con título y descripción propios", () => {
    expect(metadata.title).toBe("Juegos anteriores");
    expect(String(metadata.description).length).toBeGreaterThan(40);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/anteriores");
    expect(metadata.openGraph).toMatchObject({ siteName: "Banda Oriental", locale: "es_UY", url: "/anteriores" });
    expect(metadata.twitter).toMatchObject({ title: "Juegos anteriores" });
  });
});
