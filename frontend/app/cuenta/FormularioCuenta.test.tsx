import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiCuenta } from "../lib/cuenta/api-cuenta";
import { leerSesion } from "../lib/cuenta/sesion";
import { ApiError } from "../lib/juego/tipos";
import { FormularioCuenta } from "./FormularioCuenta";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/login");
});
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

const escribir = (etiqueta: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const enviar = async (boton: RegExp | string) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: boton })));
};
const montar = (props: Partial<Parameters<typeof FormularioCuenta>[0]> = {}, cliente = api()) => {
  const alEntrar = vi.fn();
  render(<FormularioCuenta api={cliente} alEntrar={alEntrar} {...props} />);
  return { cliente, alEntrar };
};

describe("FormularioCuenta: iniciar sesión", () => {
  it("abre en 'Iniciá sesión' con el correo y la contraseña, y el camino a crear una cuenta", () => {
    montar();

    expect(screen.getByRole("heading", { level: 1, name: "Iniciá sesión" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre de usuario")).toBeNull();
    expect(screen.getByRole("button", { name: "Creá una" })).toBeInTheDocument();
  });

  it("con contraseña: entra, guarda la sesión y avisa", async () => {
    const { cliente, alEntrar } = montar();

    escribir("Correo electrónico", "  Ana@Example.COM ");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Iniciar sesión");

    expect(cliente.entrar).toHaveBeenCalledWith("ana@example.com", "una-clave-larga-1");
    expect(leerSesion()).toEqual({ token: "tok-1", email: "ana@example.com" });
    expect(alEntrar).toHaveBeenCalled();
  });

  it("muestra el mensaje de la API si no puede entrar, y no guarda ninguna sesión", async () => {
    montar({}, api({ entrar: vi.fn().mockRejectedValue(new ApiError("Correo o contraseña incorrectos.", 400)) }));

    escribir("Correo electrónico", "ana@example.com");
    escribir("Contraseña", "mala");
    await enviar("Iniciar sesión");

    expect(screen.getByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
    expect(leerSesion()).toBeNull();
  });

  it("pide el correo y la contraseña antes de llamar a la API", async () => {
    const { cliente } = montar();

    await enviar("Iniciar sesión");
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí tu correo");
    escribir("Correo electrónico", "ana@example.com");
    await enviar("Iniciar sesión");
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí tu contraseña");
    expect(cliente.entrar).not.toHaveBeenCalled();
  });

  it("si faltan días para poder probar de nuevo (429) lo dice y ofrece el enlace por correo", async () => {
    montar({}, api({ entrar: vi.fn().mockRejectedValue(new ApiError("Demasiados intentos. Probá de nuevo en unos minutos.", 429)) }));
    escribir("Correo electrónico", "ana@example.com");
    escribir("Contraseña", "x");

    await enviar("Iniciar sesión");

    expect(screen.getByRole("alert")).toHaveTextContent("Demasiados intentos");
    expect(screen.getByRole("button", { name: "Mejor entrar con un enlace por correo" })).toBeInTheDocument();
  });

  it("si el correo no está confirmado ofrece mandar un enlace, que además lo confirma", async () => {
    const { cliente } = montar({}, api({ entrar: vi.fn().mockRejectedValue(new ApiError("Confirmá tu correo antes de entrar.", 403, "email_not_confirmed")) }));
    escribir("Correo electrónico", "ana@example.com");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Iniciar sesión");

    await enviar("Enviarme un enlace para entrar");

    expect(cliente.pedirEnlace).toHaveBeenCalledWith("ana@example.com", false);
    expect(screen.getByRole("status")).toHaveTextContent("ana@example.com");
  });

  it("no deja mandar dos veces mientras espera la respuesta", async () => {
    let terminar!: (token: string) => void;
    montar({}, api({ entrar: vi.fn(() => new Promise((resolver) => (terminar = resolver))) }));
    escribir("Correo electrónico", "ana@example.com");
    escribir("Contraseña", "una-clave-larga-1");

    await enviar("Iniciar sesión");

    expect(screen.getByRole("button", { name: "Entrando…" })).toBeDisabled();
    await act(async () => terminar("tok"));
  });

  it("sin conexión muestra el error en vez de quedarse esperando", async () => {
    montar({}, api({ entrar: vi.fn().mockRejectedValue(new ApiError("No se pudo conectar con el servidor.", 0)) }));
    escribir("Correo electrónico", "ana@example.com");
    escribir("Contraseña", "x");

    await enviar("Iniciar sesión");

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo conectar");
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
  });
});

describe("FormularioCuenta: la contraseña", () => {
  it("se puede mostrar y ocultar con el ojito, que dice en qué estado está", () => {
    montar();
    const campo = screen.getByLabelText("Contraseña");
    expect(campo).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(campo).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(campo).toHaveAttribute("type", "password");
  });
});

describe("FormularioCuenta: entrar con un enlace por correo", () => {
  const conEnlace = () => {
    const cliente = api();
    montar({}, cliente);
    fireEvent.click(screen.getByRole("button", { name: "Entrar con un enlace por correo" }));
    return cliente;
  };

  it("se cambia con un botón: sin contraseña, y se puede volver a entrar con ella", () => {
    conEnlace();

    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Entrar con contraseña" }));
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("pide el enlace y dice a qué correo se mandó, sin abrir ninguna sesión", async () => {
    const cliente = conEnlace();

    escribir("Correo electrónico", "Ana@Example.com");
    await enviar("Enviarme el enlace");

    expect(cliente.pedirEnlace).toHaveBeenCalledWith("ana@example.com", false);
    expect(screen.getByRole("status")).toHaveTextContent("ana@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("15 minutos");
    expect(leerSesion()).toBeNull();
  });

  it("avisa que si todavía no hay cuenta se crea una y se aceptan los Términos, y deja elegir las novedades", async () => {
    const cliente = conEnlace();

    expect(screen.getByText(/si todavía no tenés cuenta, al continuar se crea una y aceptás/i)).toBeInTheDocument();
    escribir("Correo electrónico", "nueva@example.com");
    fireEvent.click(screen.getByRole("checkbox", { name: /Quiero recibir novedades/ }));
    await enviar("Enviarme el enlace");

    expect(cliente.pedirEnlace).toHaveBeenCalledWith("nueva@example.com", true);
  });

  it("una vez enviado se puede volver a pedir con otro correo", async () => {
    conEnlace();
    escribir("Correo electrónico", "ana@example.com");
    await enviar("Enviarme el enlace");

    fireEvent.click(screen.getByRole("button", { name: "Usar otro correo" }));

    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
  });
});

describe("FormularioCuenta: crear la cuenta", () => {
  const crear = () => {
    const cliente = api();
    montar({}, cliente);
    fireEvent.click(screen.getByRole("button", { name: "Creá una" }));
    return cliente;
  };

  it("cambia a 'Creá tu cuenta' con el nombre de usuario, el correo y la contraseña, y se puede volver", () => {
    crear();

    expect(screen.getByRole("heading", { level: 1, name: "Creá tu cuenta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre de usuario")).toBeInTheDocument();
    expect(screen.getByText("Así te verán otros jugadores.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("placeholder", expect.stringContaining("10"));

    fireEvent.click(screen.getByRole("button", { name: "Iniciá sesión" }));
    expect(screen.getByRole("heading", { level: 1, name: "Iniciá sesión" })).toBeInTheDocument();
  });

  it("registra con el nombre de usuario y pide confirmar el correo, sin abrir sesión", async () => {
    const cliente = crear();

    escribir("Nombre de usuario", "BrandonT");
    escribir("Correo electrónico", "Nueva@Example.com");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Crear cuenta");

    expect(cliente.registrar).toHaveBeenCalledWith("nueva@example.com", "una-clave-larga-1", false, "BrandonT");
    expect(screen.getByRole("status")).toHaveTextContent("nueva@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("Confirmá");
    expect(leerSesion()).toBeNull();
  });

  it("el nombre de usuario es opcional", async () => {
    const cliente = crear();

    escribir("Correo electrónico", "nueva@example.com");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Crear cuenta");

    expect(cliente.registrar).toHaveBeenCalledWith("nueva@example.com", "una-clave-larga-1", false, "");
  });

  it("dice que al crear la cuenta se aceptan los Términos y la Política, con enlaces que abren aparte", () => {
    crear();

    const legal = screen.getByText(/Al crear una cuenta aceptás nuestros/);
    expect(legal).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Términos de uso" })).toHaveAttribute("href", "/terminos");
    expect(screen.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", "/privacidad");
    expect(screen.getByRole("link", { name: "Términos de uso" })).toHaveAttribute("target", "_blank");
  });

  it("las novedades por correo son una casilla aparte, opcional y apagada, que se manda si se tilda", async () => {
    const cliente = crear();
    const casilla = screen.getByRole("checkbox", { name: /Quiero recibir novedades de Banda Oriental por correo/ });
    expect(casilla).not.toBeChecked();

    fireEvent.click(casilla);
    escribir("Correo electrónico", "nueva@example.com");
    escribir("Contraseña", "una-clave-larga-1");
    await enviar("Crear cuenta");

    expect(cliente.registrar).toHaveBeenCalledWith("nueva@example.com", "una-clave-larga-1", true, "");
  });

  it("avisa si la contraseña es corta, sin llamar a la API", async () => {
    const cliente = crear();
    escribir("Correo electrónico", "nueva@example.com");
    escribir("Contraseña", "corta");

    await enviar("Crear cuenta");

    expect(screen.getByRole("alert")).toHaveTextContent("al menos 10 caracteres");
    expect(cliente.registrar).not.toHaveBeenCalled();
  });

  it("muestra el motivo si la API rechaza la contraseña o el nombre (por ejemplo, ya en uso)", async () => {
    montar({}, api({ registrar: vi.fn().mockRejectedValue(new ApiError("Ese nombre ya está en uso. Elegí otro.", 400)) }));
    fireEvent.click(screen.getByRole("button", { name: "Creá una" }));
    escribir("Nombre de usuario", "BrandonT");
    escribir("Correo electrónico", "nueva@example.com");
    escribir("Contraseña", "una-clave-larga-1");

    await enviar("Crear cuenta");

    expect(screen.getByRole("alert")).toHaveTextContent("ya está en uso");
  });

  it("el nombre de usuario tiene un largo máximo", () => {
    crear();

    expect(screen.getByLabelText("Nombre de usuario")).toHaveAttribute("maxlength", "50");
  });

  it("puede abrir directamente en 'Creá tu cuenta' (el enlace /login?modo=crear)", () => {
    montar({ modoInicial: "crear" });

    expect(screen.getByRole("heading", { level: 1, name: "Creá tu cuenta" })).toBeInTheDocument();
  });

  it("la dirección acompaña al modo (se puede compartir el enlace a crear la cuenta)", () => {
    crear();
    expect(window.location.search).toBe("?modo=crear");

    fireEvent.click(screen.getByRole("button", { name: "Iniciá sesión" }));
    expect(window.location.search).toBe("");
  });
});

describe("FormularioCuenta: olvidé mi contraseña", () => {
  it("pide el enlace para elegir una nueva y responde lo mismo exista o no el correo", async () => {
    const { cliente } = montar();

    fireEvent.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));
    expect(screen.getByRole("heading", { level: 1, name: "Recuperá tu contraseña" })).toBeInTheDocument();
    escribir("Correo electrónico", "ana@example.com");
    await enviar("Enviarme el enlace");

    expect(cliente.pedirRestablecer).toHaveBeenCalledWith("ana@example.com");
    expect(screen.getByRole("status")).toHaveTextContent("Si ese correo tiene una cuenta");
  });

  it("se puede volver a entrar", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });
});
