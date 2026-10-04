import { afterEach, describe, expect, it, vi } from "vitest";
import { cuentasActivas } from "./activas";

afterEach(() => vi.unstubAllEnvs());

describe("cuentasActivas", () => {
  it("está apagado por defecto: hasta que el correo funcione nadie debería poder crear una cuenta", () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "");

    expect(cuentasActivas()).toBe(false);
  });

  it("se prende con 1", () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "1");

    expect(cuentasActivas()).toBe(true);
  });

  it.each(["0", "true", "si", " 1 x"])("cualquier otro valor (%s) lo deja apagado", (valor) => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", valor);

    expect(cuentasActivas()).toBe(false);
  });
});
