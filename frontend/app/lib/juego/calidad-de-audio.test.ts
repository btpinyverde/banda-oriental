import { afterEach, describe, expect, it, vi } from "vitest";
import { calidadActual, elegirCalidad, olvidarVelocidad, registrarVelocidad, UMBRAL_LENTO } from "./calidad-de-audio";

afterEach(() => {
  olvidarVelocidad();
  vi.unstubAllGlobals();
});

describe("elegirCalidad", () => {
  it("sin ningún dato usa la buena", () => {
    expect(elegirCalidad({})).toBe("high");
  });

  it("si el navegador dice que la conexión es lenta o que se ahorren datos, usa la liviana", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(elegirCalidad({ conexion: { effectiveType } })).toBe("low");
    }
    expect(elegirCalidad({ conexion: { saveData: true } })).toBe("low");
    expect(elegirCalidad({ conexion: { effectiveType: "4g" } })).toBe("high");
  });

  it("con poco ancho de banda informado usa la liviana; con mucho, la buena", () => {
    expect(elegirCalidad({ conexion: { effectiveType: "4g", downlink: 1.2 } })).toBe("low");
    expect(elegirCalidad({ conexion: { effectiveType: "4g", downlink: 10 } })).toBe("high");
  });

  it("si la última descarga fue lenta, la siguiente usa la liviana (Safari no informa la conexión, así que se mide)", () => {
    expect(elegirCalidad({ velocidad: UMBRAL_LENTO - 1 })).toBe("low");
    expect(elegirCalidad({ velocidad: UMBRAL_LENTO + 1 })).toBe("high");
  });

  it("una medición rápida no pisa lo que informa el navegador cuando este dice que es lenta", () => {
    expect(elegirCalidad({ conexion: { effectiveType: "2g" }, velocidad: 9_000_000 })).toBe("low");
  });
});

describe("calidadActual: se decide en el momento, con lo que se sabe de la conexión", () => {
  it("empieza con la buena y pasa a la liviana si la última descarga fue lenta", () => {
    expect(calidadActual()).toBe("high");

    registrarVelocidad(UMBRAL_LENTO - 1);

    expect(calidadActual()).toBe("low");
  });

  it("vuelve a la buena si la conexión mejora", () => {
    registrarVelocidad(UMBRAL_LENTO - 1);
    registrarVelocidad(UMBRAL_LENTO * 4);

    expect(calidadActual()).toBe("high");
  });

  it("usa lo que informa el navegador", () => {
    vi.stubGlobal("navigator", { connection: { effectiveType: "3g" } });

    expect(calidadActual()).toBe("low");
  });
});
