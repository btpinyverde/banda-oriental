import { afterEach, describe, expect, it, vi } from "vitest";
import { construirJsonLd, construirVerificacion } from "./seo";

afterEach(() => vi.unstubAllEnvs());

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

describe("construirJsonLd: sameAs", () => {
  const organizacion = () => (construirJsonLd()["@graph"] as { "@type": string; sameAs?: string[] }[]).find((n) => n["@type"] === "Organization")!;

  it("sin perfiles creados no declara ninguno (no se declaran perfiles que no existen)", () => {
    expect(organizacion().sameAs).toBeUndefined();
  });

  it("con perfiles configurados los declara", () => {
    vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_URL", "https://www.instagram.com/bandaoriental");
    vi.stubEnv("NEXT_PUBLIC_TIKTOK_URL", "https://www.tiktok.com/@bandaoriental");

    expect(organizacion().sameAs).toEqual(["https://www.instagram.com/bandaoriental", "https://www.tiktok.com/@bandaoriental"]);
  });
});
