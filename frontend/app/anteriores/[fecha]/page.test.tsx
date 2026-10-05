import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as archivo from "../../lib/anteriores";
import PaginaDelDia, { generateMetadata, generateStaticParams } from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const parametros = (fecha: string) => ({ params: Promise.resolve({ fecha }) });
const dia = { date: "2026-10-02", song_title: "Luna negra", artist: "Jorge Drexler", album: "Vaivén", artist_instagram_handle: "" };

describe("/anteriores/<fecha>", () => {
  it("muestra el día", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(dia);

    render(await PaginaDelDia(parametros("2026-10-02")));

    expect(screen.getByRole("heading", { level: 1, name: "Luna negra" })).toBeInTheDocument();
  });

  it("un día que no existe (o todavía no venció) da la página 404", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue("no-encontrado");

    await expect(PaginaDelDia(parametros("2030-01-01"))).rejects.toThrow();
  });

  it("si la API no responde la página falla (no muestra un aviso con 200): así Next sigue sirviendo la última versión buena y, si no hay ninguna, da un error temporal que Google reintenta en vez de desindexar el día", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(null);

    await expect(PaginaDelDia(parametros("2026-10-02"))).rejects.toThrow(/No se pudo cargar/);
  });

  it("no se arman días de antemano: cada uno se arma la primera vez que lo piden y queda en caché (ISR)", async () => {
    expect(await generateStaticParams()).toEqual([]);
  });

  it("los datos de la vista previa del link y de Google salen del día, en el HTML que llega", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(dia);

    const meta = await generateMetadata(parametros("2026-10-02"));

    expect(String(meta.title)).toContain("Luna negra");
    expect(String(meta.title)).toContain("Jorge Drexler");
    expect(String(meta.description)).toContain("Vaivén");
    expect(meta.alternates?.canonical).toBe("/anteriores/2026-10-02");
    expect(meta.openGraph?.title).toBe(meta.title);
    // Next combina la metadata de forma superficial: lo que el sitio ya decía (nombre, idioma) se repite acá.
    expect(meta.openGraph).toMatchObject({ siteName: "Banda Oriental", locale: "es_UY", url: "/anteriores/2026-10-02" });
    expect(meta.twitter).toMatchObject({ title: meta.title, description: meta.description });
    expect(meta.robots).toBeUndefined();
  });

  it("un día que no existe no se indexa", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue("no-encontrado");

    expect((await generateMetadata(parametros("2030-01-01"))).robots).toMatchObject({ index: false });
  });

  it("si la API falla no se marca el día como no indexable (la página falla y se reintenta)", async () => {
    vi.spyOn(archivo, "obtenerDia").mockResolvedValue(null);

    expect((await generateMetadata(parametros("2026-10-02"))).robots).toBeUndefined();
  });
});
