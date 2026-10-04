import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CLAVE = "banda-oriental:device-id";
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function cargar() {
  vi.resetModules();
  return (await import("./dispositivo")).idDeDispositivo;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("idDeDispositivo", () => {
  it("crea un UUID la primera vez y lo guarda en el navegador", async () => {
    const idDeDispositivo = await cargar();

    const id = idDeDispositivo();

    expect(id).toMatch(UUID);
    expect(window.localStorage.getItem(CLAVE)).toBe(id);
  });

  it("reutiliza el mismo identificador en las visitas siguientes", async () => {
    const primero = (await cargar())();
    const segundo = (await cargar())();

    expect(segundo).toBe(primero);
  });

  it("reemplaza un valor guardado que no sea un UUID válido", async () => {
    window.localStorage.setItem(CLAVE, "cualquier-cosa");

    const id = (await cargar())();

    expect(id).toMatch(UUID);
    expect(window.localStorage.getItem(CLAVE)).toBe(id);
  });

  it("sigue funcionando en memoria si el navegador bloquea el almacenamiento", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const idDeDispositivo = await cargar();

    const id = idDeDispositivo();

    expect(id).toMatch(UUID);
    expect(idDeDispositivo()).toBe(id);
  });
});
