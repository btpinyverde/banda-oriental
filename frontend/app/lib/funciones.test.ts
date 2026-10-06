import { afterEach, describe, expect, it, vi } from "vitest";
import { batallaActiva } from "./funciones";

afterEach(() => vi.unstubAllEnvs());

describe("batallaActiva", () => {
  it("está prendido por defecto: el modo batalla se muestra en la landing y la navegación", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "");

    expect(batallaActiva()).toBe(true);
  });

  it("también con 1", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "1");

    expect(batallaActiva()).toBe(true);
  });

  it("se apaga con 0 (el interruptor para esconderlo de nuevo)", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "0");

    expect(batallaActiva()).toBe(false);
  });

  it.each(["true", "si", " 1 x", "cualquier cosa"])("cualquier otro valor (%s) lo deja prendido: solo 0 lo apaga", (valor) => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", valor);

    expect(batallaActiva()).toBe(true);
  });
});
