import { describe, expect, it } from "vitest";
import { ondaProvisoria, picosDeOnda, sumarSeñales } from "./onda";

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

describe("sumarSeñales", () => {
  it("suma las pistas muestra a muestra, como suenan juntas", () => {
    const suma = sumarSeñales([new Float32Array([0.1, 0.2, 0.3]), new Float32Array([0.4, -0.2, 0.1])]);

    expect(Array.from(suma).map((n) => Number(n.toFixed(2)))).toEqual([0.5, 0, 0.4]);
  });

  it("alcanza el largo de la pista más larga y completa las cortas con silencio", () => {
    const suma = sumarSeñales([new Float32Array([1, 1]), new Float32Array([1, 1, 1, 1])]);

    expect(Array.from(suma)).toEqual([2, 2, 1, 1]);
  });

  it("sin pistas devuelve una señal vacía", () => {
    expect(sumarSeñales([])).toHaveLength(0);
  });
});

describe("ondaProvisoria", () => {
  it("devuelve la cantidad de barras pedida, todas entre el mínimo y 1", () => {
    const barras = ondaProvisoria(64);

    expect(barras).toHaveLength(64);
    expect(Math.min(...barras)).toBeGreaterThanOrEqual(0.15);
    expect(Math.max(...barras)).toBeLessThanOrEqual(1);
  });

  it("siempre es la misma onda (no cambia entre cargas ni entre pantallas)", () => {
    expect(ondaProvisoria(64)).toEqual(ondaProvisoria(64));
  });

  it("parece música y no una raya: tiene picos altos, valles bajos y variación entre vecinas", () => {
    const barras = ondaProvisoria(64);

    expect(Math.max(...barras) - Math.min(...barras)).toBeGreaterThan(0.5);
    const saltos = barras.slice(1).filter((altura, i) => Math.abs(altura - barras[i]) > 0.04).length;
    expect(saltos).toBeGreaterThan(40);
  });

  it("es más suave en los bordes: arranca y termina más bajita", () => {
    const barras = ondaProvisoria(64);
    const promedio = (tramo: number[]) => tramo.reduce((a, b) => a + b, 0) / tramo.length;

    expect(promedio(barras.slice(0, 4))).toBeLessThan(promedio(barras.slice(24, 40)));
    expect(promedio(barras.slice(-4))).toBeLessThan(promedio(barras.slice(24, 40)));
  });
});
