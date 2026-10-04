import { describe, expect, it } from "vitest";
import { picosDeOnda } from "./onda";

describe("picosDeOnda", () => {
  it("reparte la señal en la cantidad de barras pedida", () => {
    expect(picosDeOnda(new Float32Array(1000), 40)).toHaveLength(40);
  });

  it("toma el volumen máximo de cada tramo, sin importar el signo", () => {
    const señal = new Float32Array([0.1, -0.5, 0.2, 0.2]);

    const [alto, bajo] = picosDeOnda(señal, 2, 0);

    expect(alto).toBe(1);
    expect(bajo).toBeCloseTo(0.4, 5);
  });

  it("normaliza para que la barra más alta valga 1", () => {
    const picos = picosDeOnda(new Float32Array([0.1, 0.3, 0.05, 0.2]), 4, 0);

    expect(Math.max(...picos)).toBe(1);
  });

  it("deja un mínimo visible en los silencios para que la barra no desaparezca", () => {
    const picos = picosDeOnda(new Float32Array([0, 0, 1, 1]), 2);

    expect(picos[0]).toBeGreaterThan(0);
  });

  it("devuelve barras mínimas si la señal está vacía o es todo silencio", () => {
    expect(picosDeOnda(new Float32Array(0), 3)).toEqual([0.08, 0.08, 0.08]);
    expect(picosDeOnda(new Float32Array(10), 2)).toEqual([0.08, 0.08]);
  });
});
