import { afterEach, describe, expect, it, vi } from "vitest";
import { batallaActiva } from "./funciones";

afterEach(() => vi.unstubAllEnvs());

describe("batallaActiva", () => {
  it("está apagado por defecto: el modo batalla no está resuelto y no se muestra nada de él", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "");

    expect(batallaActiva()).toBe(false);
  });

  it("se prende con 1", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "1");

    expect(batallaActiva()).toBe(true);
  });

  it.each(["0", "true", "si", " 1 x"])("cualquier otro valor (%s) lo deja apagado", (valor) => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", valor);

    expect(batallaActiva()).toBe(false);
  });
});
