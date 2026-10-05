import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RankingServidor } from "../lib/juego/tipos";
import { BotonCompartirPosicion } from "./BotonCompartirPosicion";

const RANKING: RankingServidor = {
  period: "week",
  from: "2026-10-05",
  to: "2026-10-11",
  entries: [],
  players: 128,
  me: { rank: 3, display_name: "Ana", score: 2450, games: 4 },
};
const definir = (nombre: string, valor: unknown) => Object.defineProperty(navigator, nombre, { value: valor, configurable: true, writable: true });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) });
  vi.stubGlobal("fetch", fetchMock);
  definir("share", undefined);
  definir("canShare", undefined);
  URL.createObjectURL = vi.fn(() => "blob:imagen");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const apretar = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Compartir mi posición" })));

describe("BotonCompartirPosicion", () => {
  it("sin puesto propio en ese ranking no ofrece nada", () => {
    const { container } = render(<BotonCompartirPosicion ranking={{ ...RANKING, me: null }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("con el menú de compartir del dispositivo, comparte la imagen con un texto que dice el puesto", async () => {
    const compartir = vi.fn().mockResolvedValue(undefined);
    definir("share", compartir);
    definir("canShare", vi.fn().mockReturnValue(true));
    render(<BotonCompartirPosicion ranking={RANKING} />);

    await apretar();

    expect(String(fetchMock.mock.calls[0][0])).toContain("/compartir/posicion?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("r=3");
    const { files, text } = compartir.mock.calls[0][0];
    expect(files[0].name).toBe("banda-oriental-ranking-week-3.png");
    expect(text).toContain("puesto 3 de 128");
  });

  it("sin menú de compartir (computadora) descarga la imagen y avisa", async () => {
    render(<BotonCompartirPosicion ranking={RANKING} />);

    await apretar();

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/descargada/i);
  });

  it("si la imagen no se pudo armar, lo dice", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    render(<BotonCompartirPosicion ranking={RANKING} />);

    await apretar();

    expect(screen.getByRole("alert")).toHaveTextContent(/No se pudo preparar la imagen/);
  });
});
