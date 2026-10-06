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
});
