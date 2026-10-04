import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as archivo from "../lib/archivo";
import PaginaArchivo, { metadata } from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("/archivo", () => {
  it("se arma en el servidor con los días de la API", async () => {
    vi.spyOn(archivo, "obtenerDias").mockResolvedValue([{ date: "2026-10-02", song_title: "Luna negra", artist: "Jorge Drexler" }]);

    render(await PaginaArchivo());

    expect(screen.getByRole("link", { name: /Luna negra/ })).toHaveAttribute("href", "/archivo/2026-10-02");
    expect(screen.getByRole("link", { name: "Ranking" })).toBeInTheDocument(); // la barra del sitio
  });

  it("si la API no responde la página igual carga y lo explica", async () => {
    vi.spyOn(archivo, "obtenerDias").mockResolvedValue(null);

    render(await PaginaArchivo());

    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar el archivo/);
  });

  it("es una página para indexar, con título y descripción propios", () => {
    expect(metadata.title).toBe("Archivo de canciones");
    expect(String(metadata.description).length).toBeGreaterThan(40);
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/archivo");
    expect(metadata.openGraph).toMatchObject({ siteName: "Banda Oriental", locale: "es_UY", url: "/archivo" });
    expect(metadata.twitter).toMatchObject({ title: "Archivo de canciones" });
  });
});
