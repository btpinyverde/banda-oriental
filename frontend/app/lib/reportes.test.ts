import { afterEach, describe, expect, it, vi } from "vitest";

const pedirConPase = vi.fn();
vi.mock("./humano/pedir-con-pase", () => ({ pedirConPase: (...args: unknown[]) => pedirConPase(...args) }));

import { enviarReporte } from "./reportes";

afterEach(() => pedirConPase.mockReset());
const respuesta = (cuerpo: unknown, estado = 201) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo });

describe("enviarReporte", () => {
  it("manda el reporte por POST como JSON a la API, sin campos vacíos", async () => {
    pedirConPase.mockResolvedValue(respuesta({ ok: true }));

    const resultado = await enviarReporte({ kind: "error", target_type: "artist", target_id: 7, message: "Hay discos de otro artista", contact: "", website: "" });

    expect(resultado).toEqual({ ok: true });
    const [ruta, opciones] = pedirConPase.mock.calls[0];
    expect(ruta).toBe("/api/catalog/reports/");
    expect(opciones.method).toBe("POST");
    expect(opciones.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(opciones.body)).toEqual({ kind: "error", target_type: "artist", target_id: 7, message: "Hay discos de otro artista", website: "" });
  });

  it("devuelve lo que la API dijo cuando rechaza el reporte (el mensaje en español)", async () => {
    pedirConPase.mockResolvedValue(respuesta({ message: ["Falta completar esto."] }, 400));

    expect(await enviarReporte({ kind: "error", message: "" })).toEqual({ ok: false, error: "Falta completar esto." });
  });

  it("con demasiados envíos avisa que espere", async () => {
    pedirConPase.mockResolvedValue(respuesta({ detail: "Demasiados pedidos seguidos. Esperá un momento y probá de nuevo." }, 429));

    const resultado = await enviarReporte({ kind: "contacto", message: "hola" });

    expect(resultado).toEqual({ ok: false, error: "Demasiados pedidos seguidos. Esperá un momento y probá de nuevo." });
  });

  it("si no hay conexión lo dice, sin romper", async () => {
    pedirConPase.mockRejectedValue(new Error("red"));

    expect(await enviarReporte({ kind: "contacto", message: "hola" })).toEqual({ ok: false, error: "No se pudo enviar. Revisá tu conexión y probá de nuevo." });
  });

  it("con imágenes manda un formulario (multipart) con los campos y las imágenes, sin fijar el tipo de contenido a mano", async () => {
    pedirConPase.mockResolvedValue(respuesta({ ok: true }));
    const captura = new File(["x"], "captura.png", { type: "image/png" });
    const otra = new File(["y"], "otra.jpg", { type: "image/jpeg" });

    const resultado = await enviarReporte({ kind: "contacto", name: "Ana", contact: "ana@correo.com", reason: "Algo no funciona", message: "Mirá", website: "" }, [captura, otra]);

    expect(resultado).toEqual({ ok: true });
    const [, opciones] = pedirConPase.mock.calls[0];
    expect(opciones.body).toBeInstanceOf(FormData);
    expect(opciones.headers?.["Content-Type"]).toBeUndefined(); // el navegador agrega el suyo, con el límite de las partes
    const cuerpo = opciones.body as FormData;
    expect(cuerpo.get("kind")).toBe("contacto");
    expect(cuerpo.get("reason")).toBe("Algo no funciona");
    expect(cuerpo.get("website")).toBe("");
    expect(cuerpo.getAll("images")).toEqual([captura, otra]);
  });

  it("sin imágenes sigue mandando JSON", async () => {
    pedirConPase.mockResolvedValue(respuesta({ ok: true }));

    await enviarReporte({ kind: "contacto", message: "hola" }, []);

    expect(pedirConPase.mock.calls[0][1].headers).toMatchObject({ "Content-Type": "application/json" });
  });
});
