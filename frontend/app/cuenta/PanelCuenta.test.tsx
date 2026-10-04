import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCuenta } from "../lib/cuenta/api-cuenta";
import { guardarSesion, leerSesion } from "../lib/cuenta/sesion";
import { guardarPartida, leerHistorial } from "../lib/juego/almacen-historial";
import { ApiError } from "../lib/juego/tipos";
import { PanelCuenta } from "./PanelCuenta";

function api(extra: Partial<Record<keyof ApiCuenta, unknown>> = {}) {
  return {
    salir: vi.fn().mockResolvedValue(undefined),
    borrarCuenta: vi.fn().mockResolvedValue(undefined),
    yo: vi.fn().mockResolvedValue({ email: "ana@example.com", date_joined: "2026-10-04T00:00:00Z", accepts_news: false, terms_accepted_at: "2026-10-04T00:00:00Z" }),
    cambiarNovedades: vi.fn().mockResolvedValue({ email: "ana@example.com", date_joined: "2026-10-04T00:00:00Z", accepts_news: true, terms_accepted_at: "2026-10-04T00:00:00Z" }),
    ...extra,
  } as unknown as ApiCuenta & Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const conSesion = () => guardarSesion({ token: "tok-1", email: "ana@example.com" });

describe("PanelCuenta", () => {
  it("sin sesión invita a entrar", () => {
    render(<PanelCuenta api={api()} />);

    expect(screen.getByText(/Todavía no iniciaste sesión/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión o crear cuenta" })).toHaveAttribute("href", "/login");
  });

  it("con sesión muestra el correo y los caminos habituales", () => {
    conSesion();

    render(<PanelCuenta api={api()} />);

    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mi historial" })).toHaveAttribute("href", "/historial");
    expect(screen.getByRole("link", { name: "Jugar el diario" })).toHaveAttribute("href", "/jugar");
  });

  it("cerrar sesión la cierra en el servidor y en este dispositivo, pero deja el historial del dispositivo", async () => {
    conSesion();
    guardarPartida({ dia: "2026-10-03", ganada: true, intentos: 2, cancion: { title: "A", artist: "B", album: "C" } });
    const cliente = api();
    render(<PanelCuenta api={cliente} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" })));

    expect(cliente.salir).toHaveBeenCalledWith("tok-1");
    expect(leerSesion()).toBeNull();
    expect(screen.getByText(/Todavía no iniciaste sesión/)).toBeInTheDocument();
    expect(leerHistorial()).toHaveLength(1);
  });

  describe("borrar la cuenta", () => {
    it("pide confirmar escribiendo BORRAR y avisa qué se pierde", () => {
      conSesion();
      render(<PanelCuenta api={api()} />);

      fireEvent.click(screen.getByRole("button", { name: "Borrar mi cuenta" }));

      expect(screen.getByText(/no se puede deshacer/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sí, borrar todo" })).toBeDisabled();
      fireEvent.change(screen.getByLabelText(/Escribí BORRAR/), { target: { value: "borrar" } });
      expect(screen.getByRole("button", { name: "Sí, borrar todo" })).toBeEnabled();
    });

    it("no borra nada hasta que se escribe la palabra", async () => {
      conSesion();
      const cliente = api();
      render(<PanelCuenta api={cliente} />);
      fireEvent.click(screen.getByRole("button", { name: "Borrar mi cuenta" }));
      fireEvent.change(screen.getByLabelText(/Escribí BORRAR/), { target: { value: "otra cosa" } });

      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, borrar todo" })));

      expect(cliente.borrarCuenta).not.toHaveBeenCalled();
    });

    it("borra la cuenta, la sesión y el historial de este dispositivo", async () => {
      conSesion();
      guardarPartida({ dia: "2026-10-03", ganada: true, intentos: 2, cancion: { title: "A", artist: "B", album: "C" } });
      const cliente = api();
      render(<PanelCuenta api={cliente} />);
      fireEvent.click(screen.getByRole("button", { name: "Borrar mi cuenta" }));
      fireEvent.change(screen.getByLabelText(/Escribí BORRAR/), { target: { value: "BORRAR" } });

      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, borrar todo" })));

      expect(cliente.borrarCuenta).toHaveBeenCalledWith("tok-1");
      expect(leerSesion()).toBeNull();
      expect(leerHistorial()).toEqual([]);
      expect(screen.getByRole("status")).toHaveTextContent("Tu cuenta se borró");
    });

    it("si falla no borra nada local y lo dice", async () => {
      conSesion();
      guardarPartida({ dia: "2026-10-03", ganada: true, intentos: 2, cancion: { title: "A", artist: "B", album: "C" } });
      const cliente = api({ borrarCuenta: vi.fn().mockRejectedValue(new ApiError("No se pudo conectar con el servidor.", 0)) });
      render(<PanelCuenta api={cliente} />);
      fireEvent.click(screen.getByRole("button", { name: "Borrar mi cuenta" }));
      fireEvent.change(screen.getByLabelText(/Escribí BORRAR/), { target: { value: "BORRAR" } });

      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, borrar todo" })));

      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo conectar");
      expect(leerSesion()).not.toBeNull();
      expect(leerHistorial()).toHaveLength(1);
    });

    it("se puede arrepentir", () => {
      conSesion();
      render(<PanelCuenta api={api()} />);
      fireEvent.click(screen.getByRole("button", { name: "Borrar mi cuenta" }));

      fireEvent.click(screen.getByRole("button", { name: "Mejor no" }));

      expect(screen.queryByLabelText(/Escribí BORRAR/)).toBeNull();
    });
  });
});


describe("PanelCuenta: novedades por correo", () => {
  it("muestra si la cuenta recibe novedades, apagado si no lo eligió", async () => {
    conSesion();

    render(<PanelCuenta api={api()} />);

    const casilla = await screen.findByRole("checkbox", { name: /Quiero recibir novedades de Banda Oriental por correo/ });
    expect(casilla).not.toBeChecked();
  });

  it("lo muestra encendido si lo eligió al crear la cuenta", async () => {
    conSesion();
    const cliente = api({ yo: vi.fn().mockResolvedValue({ email: "ana@example.com", date_joined: "x", accepts_news: true, terms_accepted_at: "x" }) });

    render(<PanelCuenta api={cliente} />);

    expect(await screen.findByRole("checkbox", { name: /Quiero recibir novedades/ })).toBeChecked();
  });

  it("se puede cambiar de idea: el cambio se manda al servidor con la sesión", async () => {
    conSesion();
    const cliente = api();
    render(<PanelCuenta api={cliente} />);

    fireEvent.click(await screen.findByRole("checkbox", { name: /Quiero recibir novedades/ }));

    await waitFor(() => expect(cliente.cambiarNovedades).toHaveBeenCalledWith("tok-1", true));
    expect(await screen.findByRole("checkbox", { name: /Quiero recibir novedades/ })).toBeChecked();
  });

  it("si el servidor no lo pudo guardar, lo dice y deja la casilla como estaba", async () => {
    conSesion();
    const cliente = api({ cambiarNovedades: vi.fn().mockRejectedValue(new ApiError("No se pudo guardar.", 500)) });
    render(<PanelCuenta api={cliente} />);

    fireEvent.click(await screen.findByRole("checkbox", { name: /Quiero recibir novedades/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar.");
    expect(screen.getByRole("checkbox", { name: /Quiero recibir novedades/ })).not.toBeChecked();
  });

  it("si no se pudieron cargar los datos de la cuenta, el panel sigue funcionando sin esa casilla", async () => {
    conSesion();
    const cliente = api({ yo: vi.fn().mockRejectedValue(new ApiError("sin red", 0)) });

    render(<PanelCuenta api={cliente} />);

    await waitFor(() => expect(cliente.yo).toHaveBeenCalled());
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Quiero recibir novedades/ })).toBeNull();
  });
});
