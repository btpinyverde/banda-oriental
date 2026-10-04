import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as archivo from "../../lib/archivo";
import PaginaDelDia, { generateMetadata } from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const parametros = (fecha: string) => ({ params: Promise.resolve({ fecha }) });
const dia = { date: "2026-10-02", song_title: "Luna negra", artist: "Jorge Drexler", album: "Vaivén", artist_instagram_handle: "" };

describe("/archivo/<fecha>", () => {
  it("muestra el día", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(dia);

    render(await PaginaDelDia(parametros("2026-10-02")));

    expect(screen.getByRole("heading", { level: 1, name: "Luna negra" })).toBeInTheDocument();
  });

  it("un día que no existe (o todavía no venció) da la página 404", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue("no-encontrado");

    await expect(PaginaDelDia(parametros("2030-01-01"))).rejects.toThrow();
  });

  it("si la API no responde no es un 404 (no se desindexa el día): se explica el problema", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(null);

    render(await PaginaDelDia(parametros("2026-10-02")));

    expect(screen.getByRole("alert")).toHaveTextContent(/No pudimos cargar este día/);
  });

  it("los datos de la vista previa del link y de Google salen del día, en el HTML que llega", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(dia);

    const meta = await generateMetadata(parametros("2026-10-02"));

    expect(String(meta.title)).toContain("Luna negra");
    expect(String(meta.title)).toContain("Jorge Drexler");
    expect(String(meta.description)).toContain("Vaivén");
    expect(meta.alternates?.canonical).toBe("/archivo/2026-10-02");
    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.robots).toBeUndefined();
  });

  it("un día que no existe o que falló no se indexa", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue("no-encontrado");
    expect((await generateMetadata(parametros("2030-01-01"))).robots).toMatchObject({ index: false });

    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(null);
    expect((await generateMetadata(parametros("2026-10-02"))).robots).toMatchObject({ index: false });
  });
});
