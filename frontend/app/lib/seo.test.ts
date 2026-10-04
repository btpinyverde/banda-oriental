import { describe, expect, it } from "vitest";
import { construirVerificacion } from "./seo";

describe("construirVerificacion", () => {
  it("devuelve el código de Google Search Console cuando está definido", () => {
    expect(construirVerificacion("abc123_-XYZ")).toEqual({ google: "abc123_-XYZ" });
  });

  it("ignora espacios alrededor del código pegado", () => {
    expect(construirVerificacion("  abc123  ")).toEqual({ google: "abc123" });
  });

  it.each([undefined, "", "   "])("no agrega nada si no hay código (%j)", (valor) => {
    expect(construirVerificacion(valor)).toBeUndefined();
  });
});
