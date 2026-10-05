import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/juego/tipos";
import type { ApiBatallas } from "../lib/batallas/api-batallas";
import { guardarHostToken } from "../lib/batallas/api-batallas";
import type { CancionCatalogo } from "../lib/juego/tipos";
import { useSala } from "../lib/batallas/useSala";
import { Sala } from "./Sala";
import { T0, enRevelacion, enRonda, sala, terminada, unible } from "./fixtures";

vi.mock("../lib/batallas/useSala", () => ({ useSala: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR") } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const refrescar = vi.fn();
const poner = (estado: Partial<ReturnType<typeof useSala>>, ahoraMs = T0 + 1000) =>
  vi.mocked(useSala).mockReturnValue({ sala: null, error: null, ahora: () => ahoraMs, refrescar, ...estado });

const CANCIONES: CancionCatalogo[] = [
  { id: 7, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "Rock" },
  { id: 8, title: "Chau", artist: "No Te Va Gustar", album: "Por lo menos hoy", year: 2007, genre: "Rock" },
];
const cargarCanciones = () => Promise.resolve(CANCIONES);
const apiCon = (metodos: Partial<Record<keyof ApiBatallas, ReturnType<typeof vi.fn>>>) => metodos as unknown as ApiBatallas;
const montar = (api: ApiBatallas = apiCon({})) => render(<Sala code="ABC234" api={api} cargarCanciones={cargarCanciones} />);

beforeEach(() => {
  window.localStorage.clear();
  refrescar.mockReset();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
});
afterEach(cleanup);

describe("Sala: antes de entrar", () => {
  it("mientras carga dice que está cargando", () => {
    poner({});
    montar();
    expect(screen.getByText(/cargando la sala/i)).toBeInTheDocument();
  });

  it("si no existe (o es de otras personas) dice que no la encontró", () => {
    poner({ error: new ApiError("No encontrado.", 404) });
    montar();
    expect(screen.getByText(/no encontramos esta sala/i)).toBeInTheDocument();
  });

  it("si no hay conexión permite reintentar", () => {
    poner({ error: new ApiError("No se pudo conectar con el servidor.", 0) });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(refrescar).toHaveBeenCalled();
  });

  it("una sala en su lobby pide el nombre y entra", async () => {
    poner({ sala: unible() });
    const unirse = vi.fn().mockResolvedValue({ player: { name: "Zoe" } });
    montar(apiCon({ unirse }));

    expect(screen.getByRole("heading", { name: /cumple/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/tu nombre/i), { target: { value: "Zoe" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar a la sala/i }));

    await waitFor(() => expect(refrescar).toHaveBeenCalled());
    expect(unirse).toHaveBeenCalledWith("ABC234", "Zoe", undefined);
  });

  it("muestra el error de la API al unirse (nombre repetido)", async () => {
    poner({ sala: unible() });
    const unirse = vi.fn().mockRejectedValue(new ApiError("Ese nombre ya está en la sala. Elegí otro.", 400));
    montar(apiCon({ unirse }));

    fireEvent.change(screen.getByLabelText(/tu nombre/i), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar a la sala/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí otro");
    expect(refrescar).not.toHaveBeenCalled();
  });
});

describe("Sala: lobby", () => {
  it("muestra el enlace, el QR y quiénes entraron", async () => {
    poner({ sala: sala() });
    montar();

    expect(screen.getByDisplayValue(/\/batalla\/ABC234$/)).toBeInTheDocument();
    expect(await screen.findByAltText(/código qr/i)).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText(/esperando que empiece/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /empezar/i })).toBeNull();
  });

  it("quien organiza ve Empezar, deshabilitado con menos de 2 jugadores", () => {
    poner({ sala: sala({ role: "host", players: [{ name: "Ana", answered: false }] }) });
    montar();

    expect(screen.getByText(/quien organiza no juega/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /empezar/i })).toBeDisabled();
  });

  it("con 2 jugadores el organizador empieza con su clave", async () => {
    guardarHostToken("ABC234", "secreto");
    poner({ sala: sala({ role: "host" }) });
    const empezar = vi.fn().mockResolvedValue({ status: "playing" });
    montar(apiCon({ empezar }));

    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    await waitFor(() => expect(refrescar).toHaveBeenCalled());
    expect(empezar).toHaveBeenCalledWith("ABC234", "secreto");
  });

  it("si no se puede empezar muestra el motivo", async () => {
    poner({ sala: sala({ role: "host" }) });
    montar(apiCon({ empezar: vi.fn().mockRejectedValue(new ApiError("No pudimos armar las canciones. Probá de nuevo.", 400)) }));

    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos armar las canciones");
  });
});

describe("Sala: ronda", () => {
  it("antes de que empiece la ronda cuenta hacia atrás", () => {
    poner({ sala: enRonda({ phase: { name: "countdown", index: 0 } }) }, T0 + 2000);
    montar();
    expect(screen.getByText("3")).toBeInTheDocument(); // starts_at es +5 s y ahora +2 s
  });

  it("al abrirse la ronda suena el audio y se puede buscar la canción", async () => {
    poner({ sala: enRonda() }, T0 + 6000);
    montar();

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("si el navegador no deja sonar solo, pide un toque", async () => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError")).mockResolvedValue(undefined);
    poner({ sala: enRonda() }, T0 + 6000);
    montar();

    const boton = await screen.findByRole("button", { name: /tocá para escuchar/i });
    fireEvent.click(boton);
    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("responde una sola vez y no dice si acertó", async () => {
    poner({ sala: enRonda() }, T0 + 6000);
    const responder = vi.fn().mockResolvedValue({ received: true });
    montar(apiCon({ responder }));

    const campo = await screen.findByRole("combobox");
    fireEvent.change(campo, { target: { value: "zafar" } });
    fireEvent.click(await screen.findByRole("option", { name: /zafar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar intento" }));

    await waitFor(() => expect(responder).toHaveBeenCalledWith("ABC234", 7));
    expect(await screen.findByText(/respuesta enviada/i)).toBeInTheDocument();
    expect(screen.queryByText(/correcto|acertaste|incorrecto/i)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(responder).toHaveBeenCalledTimes(1);
  });

  it("si ya respondió en esta ronda no muestra el buscador", async () => {
    poner({ sala: enRonda({ round: { index: 0, starts_at: new Date(T0 + 5000).toISOString(), ends_at: new Date(T0 + 15000).toISOString(), preview_url: "x", answered: true } }) }, T0 + 6000);
    montar();
    expect(await screen.findByText(/respuesta enviada/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("quien organiza no oye ni busca: ve cuántos respondieron", () => {
    poner({ sala: enRonda({ role: "host", players: [{ name: "Ana", answered: true }, { name: "Beto", answered: false }] }) }, T0 + 6000);
    montar();

    expect(screen.getByText(/respondieron 1 de 2/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});

describe("Sala: resultados", () => {
  it("entre rondas muestra la canción correcta, tu puntaje y el ranking parcial", () => {
    poner({ sala: enRevelacion() });
    montar();

    expect(screen.getByText("Zafar", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/La Vela Puerca/)).toBeInTheDocument();
    expect(screen.getByText(/\+130/)).toBeInTheDocument();
    const tabla = screen.getByRole("table");
    expect(within(tabla).getAllByRole("row")).toHaveLength(3); // encabezado + 2 jugadores
  });

  it("si no respondió lo dice", () => {
    poner({ sala: enRevelacion({ reveal: { song: { id: 7, title: "Zafar", artist: "LVP", album: "A", year: 2001, genre: "Rock" }, my_answer: null } }) });
    montar();
    expect(screen.getByText(/no respondiste/i)).toBeInTheDocument();
  });

  it("al terminar muestra el ranking final y los caminos de salida", () => {
    poner({ sala: terminada() });
    montar();

    expect(screen.getByRole("heading", { name: /resultados/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mis batallas/i })).toHaveAttribute("href", "/ranking?vista=batallas");
    expect(screen.getByRole("link", { name: /crear otra batalla/i })).toHaveAttribute("href", "/batalla");
  });
});
