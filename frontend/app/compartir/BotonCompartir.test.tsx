import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatosStory } from "../lib/compartir/story";
import { BotonCompartir } from "./BotonCompartir";

const DATOS: DatosStory = { filas: ["caee", "aaaa"], intentos: 2, numero: 138 };

const respuestaConImagen = () => ({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) });
const definir = (nombre: string, valor: unknown) => Object.defineProperty(navigator, nombre, { value: valor, configurable: true, writable: true });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(respuestaConImagen());
  vi.stubGlobal("fetch", fetchMock);
  definir("share", undefined);
  definir("canShare", undefined);
  URL.createObjectURL = vi.fn(() => "blob:imagen");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const apretar = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Compartir resultado" })));

describe("BotonCompartir: con el menú de compartir del dispositivo", () => {
  beforeEach(() => {
    definir("share", vi.fn().mockResolvedValue(undefined));
    definir("canShare", vi.fn().mockReturnValue(true));
  });

  it("pide la imagen de la story con los datos de la partida", async () => {
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/compartir\/story\?.*g=caee\.aaaa/);
  });

  it("comparte la imagen como archivo, con el número, el resultado y el link como texto", async () => {
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    const [opciones] = (navigator.share as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opciones.files).toHaveLength(1);
    expect(opciones.files[0].name).toBe("banda-oriental-138.png");
    expect(opciones.files[0].type).toBe("image/png");
    expect(opciones.text).toMatch(/^Banda Oriental #138 · 2\/6\nhttps?:\/\//);
  });

  it("mientras el menú de compartir está abierto el botón ya no dice que prepara la imagen", async () => {
    let cerrar!: () => void;
    definir("share", vi.fn(() => new Promise<void>((resolver) => (cerrar = resolver))));
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(screen.queryByRole("button", { name: "Preparando imagen…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
    await act(async () => cerrar());
  });

  it("si la persona cierra el menú sin compartir no es un error", async () => {
    definir("share", vi.fn().mockRejectedValue(new DOMException("cancelado", "AbortError")));
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeEnabled();
  });
});

describe("BotonCompartir: sin menú de compartir (por ejemplo en una computadora)", () => {
  it("descarga la imagen y lo avisa", async () => {
    let enlace: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      enlace = this;
    });
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(enlace?.download).toBe("banda-oriental-138.png");
    expect(enlace?.href).toContain("blob:imagen");
    expect(screen.getByRole("status")).toHaveTextContent("Imagen descargada");
  });

  it("si el dispositivo no acepta compartir archivos, también descarga", async () => {
    definir("share", vi.fn());
    definir("canShare", vi.fn().mockReturnValue(false));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(navigator.share).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Imagen descargada");
  });
});

describe("BotonCompartir: estados", () => {
  it("mientras prepara la imagen queda bloqueado y lo dice", async () => {
    let terminar!: (valor: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(screen.getByRole("button", { name: "Preparando imagen…" })).toBeDisabled();
    await act(async () => terminar(respuestaConImagen()));
  });

  it("si no se puede generar la imagen avisa y deja volver a intentar", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo preparar la imagen"));
    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeEnabled();
  });

  it("un fallo de red también se informa, sin romper la pantalla", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<BotonCompartir datos={DATOS} />);

    await apretar();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("acepta otra etiqueta y nombra el archivo de la versión revelada", async () => {
    definir("share", vi.fn().mockResolvedValue(undefined));
    definir("canShare", vi.fn().mockReturnValue(true));
    const revelada = { ...DATOS, cancion: { titulo: "A las nueve", artista: "No Te Va Gustar", disco: "El camino más largo" } };
    render(<BotonCompartir datos={revelada} etiqueta="Compartir mostrando la canción" />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Compartir mostrando la canción" })));

    expect((navigator.share as ReturnType<typeof vi.fn>).mock.calls[0][0].files[0].name).toBe("banda-oriental-138-revelada.png");
  });
});
