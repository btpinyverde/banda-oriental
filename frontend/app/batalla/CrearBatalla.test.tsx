import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/juego/tipos";
import type { ApiBatallas } from "../lib/batallas/api-batallas";
import { leerHostToken } from "../lib/batallas/api-batallas";
import { CrearBatalla } from "./CrearBatalla";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const CANCIONES = [
  { id: 1, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "Rock" },
  { id: 2, title: "Chau", artist: "No Te Va Gustar", album: "Por lo menos hoy", year: 2007, genre: "Rock" },
];
const apiCon = (crear: ReturnType<typeof vi.fn>, extra: Partial<Record<keyof ApiBatallas, ReturnType<typeof vi.fn>>> = {}) => ({ crear, ...extra }) as unknown as ApiBatallas;
const montar = (api: ApiBatallas) =>
  render(<CrearBatalla api={api} cargarCanciones={() => Promise.resolve(CANCIONES)} cargarGeneros={() => Promise.resolve(["Rock", "Pop"])} buscarArtistas={() => Promise.resolve([])} />);
const campo = (nombre: RegExp) => screen.getByLabelText(nombre);

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  window.localStorage.clear();
});

describe("CrearBatalla", () => {
  it("crea la sala con los valores por defecto, guarda la clave del organizador y va a la sala", async () => {
    const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "secreto" });
    montar(apiCon(crear));

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/batalla/ABC234"));
    expect(crear).toHaveBeenCalledWith({ rondas: 10, segundos: 20, titulo: "", audioMode: "each", joinMode: "open" });
    expect(leerHostToken("ABC234")).toBe("secreto");
  });

  it("manda lo que se escribió", async () => {
    const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
    montar(apiCon(crear));

    fireEvent.change(campo(/título/i), { target: { value: "Cumple de Ana" } });
    fireEvent.change(campo(/^canciones$/i), { target: { value: "5" } });
    fireEvent.change(campo(/^segundos por ronda/i), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith({ rondas: 5, segundos: 15, titulo: "Cumple de Ana", audioMode: "each", joinMode: "open" }));
  });

  it("deja elegir que la música suene solo en la pantalla del anfitrión y aceptar a cada persona", async () => {
    const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
    montar(apiCon(crear));

    fireEvent.click(screen.getByLabelText(/solo en mi pantalla/i));
    fireEvent.click(screen.getByLabelText(/aceptar a cada persona/i));
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ audioMode: "host", joinMode: "approval" })));
  });

  it.each([
    ["canciones", "2", /entre 3 y 30/],
    ["canciones", "31", /entre 3 y 30/],
    ["segundos", "4", /entre 5 y 60/],
    ["segundos", "61", /entre 5 y 60/],
  ])("%s = %s se rechaza en pantalla, sin llamar a la API", (nombre, valor, mensaje) => {
    const crear = vi.fn();
    montar(apiCon(crear));

    fireEvent.change(campo(nombre === "canciones" ? /^canciones$/i : /^segundos por ronda/i), { target: { value: valor } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    expect(screen.getByRole("alert")).toHaveTextContent(mensaje);
    expect(crear).not.toHaveBeenCalled();
  });

  it("muestra el error de la API", async () => {
    const crear = vi.fn().mockRejectedValue(new ApiError("Título inválido.", 400));
    montar(apiCon(crear));

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Título inválido.");
    expect(push).not.toHaveBeenCalled();
  });

  it("no deja apretar dos veces mientras crea", async () => {
    let resolver!: (v: unknown) => void;
    const crear = vi.fn().mockReturnValue(new Promise((r) => (resolver = r)));
    montar(apiCon(crear));

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("button", { name: /creando/i })).toBeDisabled();
    resolver({ code: "ABC234", host_token: "t" });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  describe("cómo se eligen las canciones", () => {
    it("por defecto es al azar y no manda filtros si no se tocó nada", async () => {
      const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
      montar(apiCon(crear));
      expect(screen.getByLabelText(/^al azar/i)).toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
      await waitFor(() => expect(crear).toHaveBeenCalled());
      expect(crear.mock.calls[0][0]).not.toHaveProperty("filtros");
      expect(crear.mock.calls[0][0]).not.toHaveProperty("modoDeCanciones");
    });

    it("manda los filtros y cuenta cuántas canciones cumplen", async () => {
      const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
      const pool = vi.fn().mockResolvedValue(57);
      montar(apiCon(crear, { pool }));

      fireEvent.change(screen.getByLabelText(/^años desde/i), { target: { value: "2000" } });
      expect(await screen.findByText(/hay 57 canciones que cumplen/i)).toBeInTheDocument();
      expect(pool).toHaveBeenLastCalledWith({ include: { year_from: 2000 }, exclude: {} });

      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
      await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ filtros: { include: { year_from: 2000 }, exclude: {} } })));
    });

    it("no crea si los filtros dejan menos canciones que las pedidas", async () => {
      const crear = vi.fn();
      montar(apiCon(crear, { pool: vi.fn().mockResolvedValue(4) }));

      fireEvent.change(screen.getByLabelText(/^años desde/i), { target: { value: "2000" } });
      await screen.findByText(/hay 4 canciones que cumplen/i);
      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

      expect(screen.getByRole("alert")).toHaveTextContent(/no alcanzan/i);
      expect(crear).not.toHaveBeenCalled();
    });

    it("elegir la lista a mano esconde la cantidad de canciones y manda la lista en orden", async () => {
      const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
      montar(apiCon(crear));

      fireEvent.click(screen.getByLabelText(/elegir yo/i));
      expect(screen.queryByLabelText(/^canciones$/i)).toBeNull();
      const catalogo = within(screen.getByRole("region", { name: /agregar del catálogo/i }));
      for (const [busca, titulo] of [["chau", /chau/i], ["zafar", /zafar/i]] as const) {
        fireEvent.change(await catalogo.findByRole("combobox"), { target: { value: busca } });
        fireEvent.click(await catalogo.findByRole("option", { name: titulo }));
        fireEvent.click(catalogo.getByRole("button", { name: /agregar a la lista/i }));
      }
      // Agregar canciones no crea la sala: el buscador trae su propio formulario y no debe disparar el de crear.
      expect(crear).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

      await waitFor(() => expect(crear).toHaveBeenCalled());
      expect(crear).toHaveBeenCalledTimes(1);
      const pedido = crear.mock.calls[0][0];
      expect(pedido.modoDeCanciones).toBe("list");
      expect(pedido.lista).toEqual([{ song_id: 2, source: "deezer" }, { song_id: 1, source: "deezer" }]);
      expect(pedido).not.toHaveProperty("rondas");
    });

    it("con la lista vacía no crea", () => {
      const crear = vi.fn();
      montar(apiCon(crear));

      fireEvent.click(screen.getByLabelText(/elegir yo/i));
      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

      expect(screen.getByRole("alert")).toHaveTextContent(/al menos una canción/i);
      expect(crear).not.toHaveBeenCalled();
    });
  });

  describe("equipos", () => {
    it("por defecto no hay equipos y no se manda nada de equipos", async () => {
      const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
      montar(apiCon(crear));
      expect(screen.getByLabelText(/sin equipos/i)).toBeChecked();
      expect(screen.queryByLabelText(/cantidad de equipos/i)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
      await waitFor(() => expect(crear).toHaveBeenCalled());
      expect(crear.mock.calls[0][0]).not.toHaveProperty("teamMode");
    });

    it("equipos al azar: se elige la cantidad y los nombres son opcionales", async () => {
      const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
      montar(apiCon(crear));

      fireEvent.click(screen.getByLabelText(/equipos al azar/i));
      fireEvent.change(screen.getByLabelText(/cantidad de equipos/i), { target: { value: "3" } });
      expect(screen.getAllByLabelText(/nombre del equipo/i)).toHaveLength(3);
      fireEvent.change(screen.getByLabelText("Nombre del equipo 1"), { target: { value: "Rojos" } });
      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

      await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ teamMode: "random", teamCount: 3, teamNames: ["Rojos", "", ""] })));
    });

    it("armar los equipos a mano también se manda", async () => {
      const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
      montar(apiCon(crear));
      fireEvent.click(screen.getByLabelText(/armo yo los equipos/i));
      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
      await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ teamMode: "manual", teamCount: 2 })));
    });

    it.each(["1", "7", "x"])("%s equipos se rechaza en pantalla", (valor) => {
      const crear = vi.fn();
      montar(apiCon(crear));
      fireEvent.click(screen.getByLabelText(/equipos al azar/i));
      fireEvent.change(screen.getByLabelText(/cantidad de equipos/i), { target: { value: valor } });
      fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
      expect(screen.getByRole("alert")).toHaveTextContent(/entre 2 y 6/);
      expect(crear).not.toHaveBeenCalled();
    });
  });
});
