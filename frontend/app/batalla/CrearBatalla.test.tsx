import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/juego/tipos";
import type { ApiBatallas } from "../lib/batallas/api-batallas";
import { leerHostToken } from "../lib/batallas/api-batallas";
import { CrearBatalla } from "./CrearBatalla";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const apiCon = (crear: ReturnType<typeof vi.fn>) => ({ crear }) as unknown as ApiBatallas;
const campo = (nombre: RegExp) => screen.getByLabelText(nombre);

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  window.localStorage.clear();
});

describe("CrearBatalla", () => {
  it("crea la sala con los valores por defecto, guarda la clave del organizador y va a la sala", async () => {
    const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "secreto" });
    render(<CrearBatalla api={apiCon(crear)} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/batalla/ABC234"));
    expect(crear).toHaveBeenCalledWith({ rondas: 10, segundos: 20, titulo: "" });
    expect(leerHostToken("ABC234")).toBe("secreto");
  });

  it("manda lo que se escribió", async () => {
    const crear = vi.fn().mockResolvedValue({ code: "ABC234", host_token: "t" });
    render(<CrearBatalla api={apiCon(crear)} />);

    fireEvent.change(campo(/título/i), { target: { value: "Cumple de Ana" } });
    fireEvent.change(campo(/canciones/i), { target: { value: "5" } });
    fireEvent.change(campo(/segundos/i), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    await waitFor(() => expect(crear).toHaveBeenCalledWith({ rondas: 5, segundos: 15, titulo: "Cumple de Ana" }));
  });

  it.each([
    ["canciones", "2", /entre 3 y 30/],
    ["canciones", "31", /entre 3 y 30/],
    ["segundos", "4", /entre 5 y 60/],
    ["segundos", "61", /entre 5 y 60/],
  ])("%s = %s se rechaza en pantalla, sin llamar a la API", (nombre, valor, mensaje) => {
    const crear = vi.fn();
    render(<CrearBatalla api={apiCon(crear)} />);

    fireEvent.change(campo(new RegExp(nombre, "i")), { target: { value: valor } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    expect(screen.getByRole("alert")).toHaveTextContent(mensaje);
    expect(crear).not.toHaveBeenCalled();
  });

  it("muestra el error de la API", async () => {
    const crear = vi.fn().mockRejectedValue(new ApiError("Título inválido.", 400));
    render(<CrearBatalla api={apiCon(crear)} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Título inválido.");
    expect(push).not.toHaveBeenCalled();
  });

  it("no deja apretar dos veces mientras crea", async () => {
    let resolver!: (v: unknown) => void;
    const crear = vi.fn().mockReturnValue(new Promise((r) => (resolver = r)));
    render(<CrearBatalla api={apiCon(crear)} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear sala" }));
    expect(screen.getByRole("button", { name: /creando/i })).toBeDisabled();
    resolver({ code: "ABC234", host_token: "t" });
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});
