import { afterEach, describe, expect, it, vi } from "vitest";
import { redesConfiguradas } from "./redes";

afterEach(() => vi.unstubAllEnvs());

describe("redesConfiguradas", () => {
  it("sin direcciones configuradas no hay ninguna red: el pie no muestra botones que no llevan a ningún lado", () => {
    vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_URL", "");
    vi.stubEnv("NEXT_PUBLIC_TIKTOK_URL", "");

    expect(redesConfiguradas()).toEqual([]);
  });

  it("devuelve solo las que tienen dirección, en el orden Instagram, TikTok", () => {
    vi.stubEnv("NEXT_PUBLIC_TIKTOK_URL", "https://www.tiktok.com/@bandaoriental");
    expect(redesConfiguradas().map((r) => r.etiqueta)).toEqual(["TikTok"]);

    vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_URL", "  https://www.instagram.com/bandaoriental  ");
    expect(redesConfiguradas()).toEqual([
      { etiqueta: "Instagram", href: "https://www.instagram.com/bandaoriental", icono: "social-instagram" },
      { etiqueta: "TikTok", href: "https://www.tiktok.com/@bandaoriental", icono: "social-tiktok" },
    ]);
  });

  it.each(["javascript:alert(1)", "http://insegura.example", "instagram.com/bandaoriental", "#", "data:text/html,x"])("una dirección que no es https (%s) se ignora", (valor) => {
    vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_URL", valor);

    expect(redesConfiguradas()).toEqual([]);
  });

  it("no hay Spotify entre las redes", () => {
    vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_URL", "https://www.instagram.com/x");

    expect(redesConfiguradas().some((r) => r.etiqueta === "Spotify")).toBe(false);
  });
});
