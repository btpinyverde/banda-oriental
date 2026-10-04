import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCuenta } from "../lib/cuenta/api-cuenta";
import { leerSesion } from "../lib/cuenta/sesion";
import { ApiError } from "../lib/juego/tipos";
import { FormularioCuenta } from "./FormularioCuenta";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function api(extra: Partial<Record<keyof ApiCuenta, unknown>> = {}) {
  return {
    entrar: vi.fn().mockResolvedValue("tok-1"),
    registrar: vi.fn().mockResolvedValue(undefined),
    pedirEnlace: vi.fn().mockResolvedValue(undefined),
    pedirRestablecer: vi.fn().mockResolvedValue(undefined),
    ...extra,
  } as unknown as ApiCuenta & Record<string, ReturnType<typeof vi.fn>>;
}

const aceptarTerminos = () => fireEvent.click(screen.getByRole("checkbox", { name: /Acepto los Términos/ }));
const escribir = (etiqueta: RegExp | string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const enviar = async (boton: RegExp | string) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: boton })));
};

describe("FormularioCuenta: entrar", () => {
  it("arranca en Entrar y deja elegir entre contraseña y enlace por correo", () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Entrar", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Con contraseña", checked: true })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Con un enlace por correo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("con contraseña: entra, guarda la sesión y avisa", async () => {
    const cliente = api();
    const alEntrar = vi.fn();
    render(<FormularioCuenta api={cliente} alEntrar={alEntrar} />);

    escribir("Correo", "  Ana@Example.COM ");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Entrar");

    expect(cliente.entrar).toHaveBeenCalledWith("ana@example.com", "una-clave-larga-1");
    expect(leerSesion()).toEqual({ token: "tok-1", email: "ana@example.com" });
    expect(alEntrar).toHaveBeenCalled();
  });

  it("muestra el mensaje de la API si no puede entrar, y no guarda ninguna sesión", async () => {
    const cliente = api({ entrar: vi.fn().mockRejectedValue(new ApiError("Correo o contraseña incorrectos.", 400)) });
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);

    escribir("Correo", "ana@example.com");
    escribir("Contraseña", "mala");
    await enviar("Entrar");

    expect(screen.getByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
    expect(leerSesion()).toBeNull();
  });

  it("si faltan días para poder probar de nuevo (429) lo dice y ofrece el enlace por correo", async () => {
    const cliente = api({ entrar: vi.fn().mockRejectedValue(new ApiError("Demasiados intentos. Probá de nuevo en unos minutos.", 429)) });
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    escribir("Correo", "ana@example.com");
    escribir("Contraseña", "x");

    await enviar("Entrar");

    expect(screen.getByRole("alert")).toHaveTextContent("Demasiados intentos");
    expect(screen.getByRole("button", { name: "Mejor entrar con un enlace por correo" })).toBeInTheDocument();
  });

  it("si el correo no está confirmado ofrece mandar un enlace, que además lo confirma", async () => {
    const cliente = api({
      entrar: vi.fn().mockRejectedValue(new ApiError("Confirmá tu correo antes de entrar.", 403, "email_not_confirmed")),
    });
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    escribir("Correo", "ana@example.com");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Entrar");
    expect(screen.getByRole("alert")).toHaveTextContent("Confirmá tu correo");

    await enviar("Enviarme un enlace para entrar");

    expect(cliente.pedirEnlace).toHaveBeenCalledWith("ana@example.com", false);
    expect(screen.getByRole("status")).toHaveTextContent("ana@example.com");
  });

  it("no deja mandar dos veces mientras espera la respuesta", async () => {
    let terminar!: (token: string) => void;
    const cliente = api({ entrar: vi.fn(() => new Promise((resolver) => (terminar = resolver))) });
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    escribir("Correo", "ana@example.com");
    escribir("Contraseña", "una-clave-larga-1");

    await enviar("Entrar");

    expect(screen.getByRole("button", { name: "Entrando…" })).toBeDisabled();
    await act(async () => terminar("tok"));
  });

  it("sin conexión muestra el error en vez de quedarse esperando", async () => {
    const cliente = api({ entrar: vi.fn().mockRejectedValue(new ApiError("No se pudo conectar con el servidor.", 0)) });
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    escribir("Correo", "ana@example.com");
    escribir("Contraseña", "x");

    await enviar("Entrar");

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo conectar");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });
});

describe("FormularioCuenta: enlace por correo", () => {
  it("pide el enlace y dice a qué correo se mandó, sin abrir ninguna sesión", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Con un enlace por correo" }));

    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    escribir("Correo", "Ana@Example.com");
    await enviar("Enviarme el enlace");

    expect(cliente.pedirEnlace).toHaveBeenCalledWith("ana@example.com", false);
    expect(screen.getByRole("status")).toHaveTextContent("ana@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("15 minutos");
    expect(leerSesion()).toBeNull();
  });

  it("una vez enviado se puede volver a pedir con otro correo", async () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Con un enlace por correo" }));
    escribir("Correo", "ana@example.com");
    await enviar("Enviarme el enlace");

    fireEvent.click(screen.getByRole("button", { name: "Usar otro correo" }));

    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });
});

describe("FormularioCuenta: crear cuenta", () => {
  const abrirCrear = () => fireEvent.click(screen.getByRole("tab", { name: "Crear cuenta" }));

  it("registra y pide confirmar el correo, sin abrir sesión", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    abrirCrear();

    escribir("Correo", "Nueva@Example.com");
    escribir("Contraseña", "una-clave-larga-1");
    aceptarTerminos();
    await enviar("Crear cuenta");

    expect(cliente.registrar).toHaveBeenCalledWith("nueva@example.com", "una-clave-larga-1", false);
    expect(screen.getByRole("status")).toHaveTextContent("nueva@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("Confirmá");
    expect(leerSesion()).toBeNull();
  });

  it("avisa si la contraseña es corta, sin llamar a la API", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    abrirCrear();

    escribir("Correo", "nueva@example.com");
    escribir("Contraseña", "corta");
    aceptarTerminos();
    await enviar("Crear cuenta");

    expect(screen.getByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(cliente.registrar).not.toHaveBeenCalled();
  });

  it("muestra el motivo si la API rechaza la contraseña", async () => {
    const cliente = api({ registrar: vi.fn().mockRejectedValue(new ApiError("Esta contraseña es demasiado común.", 400)) });
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    abrirCrear();
    escribir("Correo", "nueva@example.com");
    escribir("Contraseña", "1234567890");
    aceptarTerminos();

    await enviar("Crear cuenta");

    expect(screen.getByRole("alert")).toHaveTextContent("demasiado común");
  });

  it("explica que sin contraseña también se puede: el enlace por correo crea la cuenta", () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);
    abrirCrear();

    expect(screen.getByText(/sin contraseña/i)).toBeInTheDocument();
  });
});

describe("FormularioCuenta: olvidé mi contraseña", () => {
  it("pide el enlace para elegir una nueva y responde lo mismo exista o no el correo", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Olvidé mi contraseña" }));
    escribir("Correo", "ana@example.com");
    await enviar("Enviarme el enlace");

    expect(cliente.pedirRestablecer).toHaveBeenCalledWith("ana@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("Si ese correo tiene una cuenta");
  });

  it("se puede volver a entrar", () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Olvidé mi contraseña" }));

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });
});


describe("FormularioCuenta: lo que se acepta al crear la cuenta", () => {
  const abrirCrear = () => fireEvent.click(screen.getByRole("tab", { name: "Crear cuenta" }));
  const llenar = () => {
    escribir("Correo", "nueva@example.com");
    escribir("Contraseña", "una-clave-larga-1");
  };

  it("al crear la cuenta hay una casilla para aceptar los Términos y la Política de Privacidad, con enlaces que abren aparte", () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);
    abrirCrear();

    const casilla = screen.getByRole("checkbox", { name: /Acepto los Términos y la Política de Privacidad/ });
    expect(casilla).not.toBeChecked();
    const terminos = screen.getByRole("link", { name: "Términos" });
    const privacidad = screen.getByRole("link", { name: "Política de Privacidad" });
    expect(terminos).toHaveAttribute("href", "/terminos");
    expect(privacidad).toHaveAttribute("href", "/privacidad");
    expect(terminos).toHaveAttribute("target", "_blank");
    expect(terminos).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("las novedades por correo son otra casilla, opcional y apagada: no se tilda sola ni va unida a los términos", () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);
    abrirCrear();

    const novedades = screen.getByRole("checkbox", { name: /Quiero recibir novedades de Banda Oriental por correo/ });
    expect(novedades).not.toBeChecked();
    expect(screen.getByText(/opcional/i)).toBeInTheDocument();
    expect(novedades).not.toBe(screen.getByRole("checkbox", { name: /Acepto los Términos/ }));
  });

  it("sin aceptar los Términos no se crea la cuenta y se explica por qué", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    abrirCrear();
    llenar();

    await enviar("Crear cuenta");

    expect(screen.getByRole("alert")).toHaveTextContent("tenés que aceptar los Términos y la Política de Privacidad");
    expect(cliente.registrar).not.toHaveBeenCalled();
  });

  it("tildar las novedades se manda al crear la cuenta", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    abrirCrear();
    llenar();
    aceptarTerminos();
    fireEvent.click(screen.getByRole("checkbox", { name: /Quiero recibir novedades/ }));

    await enviar("Crear cuenta");

    expect(cliente.registrar).toHaveBeenCalledWith("nueva@example.com", "una-clave-larga-1", true);
  });

  it("con el enlace por correo (que puede crear la cuenta) avisa que continuar acepta los Términos y deja elegir las novedades", async () => {
    const cliente = api();
    render(<FormularioCuenta api={cliente} alEntrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Con un enlace por correo" }));

    expect(screen.getByText(/si todavía no tenés cuenta, al continuar se crea una y aceptás/i)).toBeInTheDocument();
    escribir("Correo", "nueva@example.com");
    fireEvent.click(screen.getByRole("checkbox", { name: /Quiero recibir novedades/ }));
    await enviar("Enviarme el enlace");

    expect(cliente.pedirEnlace).toHaveBeenCalledWith("nueva@example.com", true);
  });

  it("entrando con contraseña no se pide nada de esto: ya aceptó al crear la cuenta", () => {
    render(<FormularioCuenta api={api()} alEntrar={vi.fn()} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
