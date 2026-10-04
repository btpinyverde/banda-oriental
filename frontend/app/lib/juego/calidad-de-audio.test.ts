import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { elegirCalidad, guardarAhorro, leerAhorro, UMBRAL_LENTO } from "./calidad-de-audio";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("elegirCalidad", () => {
  it("sin ningún dato usa la buena", () => {
    expect(elegirCalidad({ ahorrar: false })).toBe("high");
  });

  it("si la persona pidió ahorrar datos usa la liviana, pase lo que pase", () => {
    expect(elegirCalidad({ ahorrar: true, conexion: { effectiveType: "4g" }, velocidad: 5_000_000 })).toBe("low");
  });

  it("si el navegador dice que la conexión es lenta o que se ahorren datos, usa la liviana", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(elegirCalidad({ ahorrar: false, conexion: { effectiveType } })).toBe("low");
    }
    expect(elegirCalidad({ ahorrar: false, conexion: { saveData: true } })).toBe("low");
    expect(elegirCalidad({ ahorrar: false, conexion: { effectiveType: "4g" } })).toBe("high");
  });

  it("si la última descarga fue lenta, la siguiente usa la liviana (Safari no informa la conexión, así que se mide)", () => {
    expect(elegirCalidad({ ahorrar: false, velocidad: UMBRAL_LENTO - 1 })).toBe("low");
    expect(elegirCalidad({ ahorrar: false, velocidad: UMBRAL_LENTO + 1 })).toBe("high");
  });

  it("una medición no pisa lo que informa el navegador cuando este dice que es lenta", () => {
    expect(elegirCalidad({ ahorrar: false, conexion: { effectiveType: "2g" }, velocidad: 9_000_000 })).toBe("low");
  });
});

describe("ahorrar datos: lo que eligió la persona", () => {
  it("empieza apagado", () => {
    expect(leerAhorro()).toBe(false);
  });

  it("se recuerda", () => {
    guardarAhorro(true);

    expect(leerAhorro()).toBe(true);
    guardarAhorro(false);
    expect(leerAhorro()).toBe(false);
  });

  it("no se guarda con la clave del juego del día, que se borra al cambiar de día", () => {
    guardarAhorro(true);

    expect(window.localStorage.key(0)).not.toMatch(/^banda-oriental:juego:/);
  });

  it("si el almacenamiento está bloqueado no se rompe", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(leerAhorro()).toBe(false);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
