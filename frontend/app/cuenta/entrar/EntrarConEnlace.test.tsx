import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCuenta } from "../../lib/cuenta/api-cuenta";
import { leerSesion } from "../../lib/cuenta/sesion";
import { ApiError } from "../../lib/juego/tipos";
import { EntrarConEnlace } from "./EntrarConEnlace";

const irA = (hash: string) => window.history.replaceState(null, "", `/cuenta/entrar${hash}`);

function api(extra: Partial<Record<keyof ApiCuenta, unknown>> = {}) {
  return {
    verificarEnlace: vi.fn().mockResolvedValue("tok-1"),
    confirmar: vi.fn().mockResolvedValue("tok-2"),
    confirmarRestablecer: vi.fn().mockResolvedValue("tok-3"),
    yo: vi.fn().mockResolvedValue({ email: "ana@example.com", date_joined: "2026-10-04T00:00:00Z" }),
    ...extra,
  } as unknown as ApiCuenta & Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => {
  window.localStorage.clear();
  irA("");
});
afterEach(cleanup);

describe("EntrarConEnlace", () => {
  it("con un enlace de acceso abre la sesión y lo dice", async () => {
    irA("#token=abc&tipo=acceso");
    const cliente = api();

    render(<EntrarConEnlace api={cliente} />);

    expect(await screen.findByText(/Ya entraste/)).toBeInTheDocument();
    expect(cliente.verificarEnlace).toHaveBeenCalledWith("abc");
    expect(leerSesion()).toEqual({ token: "tok-1", email: "ana@example.com" });
    expect(screen.getByRole("link", { name: "Jugar el diario" })).toHaveAttribute("href", "/jugar");
    expect(screen.getByRole("link", { name: "Ir a mi cuenta" })).toHaveAttribute("href", "/cuenta");
  });

  it("con un enlace de confirmación confirma el correo y entra", async () => {
    irA("#token=abc&tipo=confirmar");
    const cliente = api();

    render(<EntrarConEnlace api={cliente} />);

    expect(await screen.findByText(/correo quedó confirmado/)).toBeInTheDocument();
    expect(cliente.confirmar).toHaveBeenCalledWith("abc");
    expect(leerSesion()?.token).toBe("tok-2");
  });

  it("saca el token de la barra de direcciones apenas lo lee (no queda en el historial del navegador)", async () => {
    irA("#token=abc&tipo=acceso");

    render(<EntrarConEnlace api={api()} />);
    await screen.findByText(/Ya entraste/);

    expect(window.location.hash).toBe("");
  });

  it("aunque la pantalla se monte dos veces (modo estricto de React) el enlace se usa una sola vez", async () => {
    irA("#token=abc&tipo=acceso");
    const cliente = api();

    render(
      <StrictMode>
        <EntrarConEnlace api={cliente} />
      </StrictMode>,
    );
    await screen.findByText(/Ya entraste/);

    expect(cliente.verificarEnlace).toHaveBeenCalledTimes(1);
  });

  it("si no se puede leer el correo de la cuenta igual abre la sesión", async () => {
    irA("#token=abc&tipo=acceso");
    const cliente = api({ yo: vi.fn().mockRejectedValue(new ApiError("No se pudo conectar con el servidor.", 0)) });

    render(<EntrarConEnlace api={cliente} />);

    expect(await screen.findByText(/Ya entraste/)).toBeInTheDocument();
    expect(leerSesion()?.token).toBe("tok-1");
  });

  it("un enlace vencido o ya usado lo explica y ofrece pedir otro", async () => {
    irA("#token=viejo&tipo=acceso");
    const cliente = api({ verificarEnlace: vi.fn().mockRejectedValue(new ApiError("El enlace no es válido o venció.", 400)) });

    render(<EntrarConEnlace api={cliente} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("El enlace no es válido o venció.");
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" })).toHaveAttribute("href", "/login");
    expect(leerSesion()).toBeNull();
  });

  it.each(["", "#", "#token=", "#tipo=acceso", "#token=abc", "#token=abc&tipo=raro"])(
    "si el enlace está incompleto (%s) lo dice sin llamar a la API",
    async (hash) => {
      irA(hash);
      const cliente = api();

      render(<EntrarConEnlace api={cliente} />);

      expect(await screen.findByRole("alert")).toHaveTextContent("El enlace no es válido");
      expect(cliente.verificarEnlace).not.toHaveBeenCalled();
      expect(cliente.confirmar).not.toHaveBeenCalled();
    },
  );

  it("con un enlace de restablecer pide la contraseña nueva y entra", async () => {
    irA("#token=abc&tipo=restablecer");
    const cliente = api();
    render(<EntrarConEnlace api={cliente} />);

    fireEvent.change(await screen.findByLabelText("Contraseña nueva"), { target: { value: "otra-clave-larga-2" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" })));

    expect(cliente.confirmarRestablecer).toHaveBeenCalledWith("abc", "otra-clave-larga-2");
    expect(await screen.findByText(/contraseña quedó cambiada/)).toBeInTheDocument();
    expect(leerSesion()?.token).toBe("tok-3");
  });

  it("restablecer: una contraseña corta se avisa sin llamar a la API", async () => {
    irA("#token=abc&tipo=restablecer");
    const cliente = api();
    render(<EntrarConEnlace api={cliente} />);

    fireEvent.change(await screen.findByLabelText("Contraseña nueva"), { target: { value: "corta" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" })));

    expect(screen.getByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(cliente.confirmarRestablecer).not.toHaveBeenCalled();
  });

  it("restablecer: si la API rechaza la contraseña muestra el motivo y deja corregir (el enlace no se gasta)", async () => {
    irA("#token=abc&tipo=restablecer");
    const cliente = api({
      confirmarRestablecer: vi.fn().mockRejectedValue(new ApiError("Esta contraseña es demasiado común.", 400)),
    });
    render(<EntrarConEnlace api={cliente} />);

    fireEvent.change(await screen.findByLabelText("Contraseña nueva"), { target: { value: "1234567890" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" })));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("demasiado común"));
    expect(screen.getByLabelText("Contraseña nueva")).toBeInTheDocument();
  });
});
