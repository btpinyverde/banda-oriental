import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("cabeceras de seguridad del sitio", () => {
  it("todas las páginas las llevan", async () => {
    const reglas = await nextConfig.headers!();
    const todas = reglas.find((r) => r.source === "/:path*");
    const cabeceras = Object.fromEntries((todas?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]));

    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
    expect(cabeceras["x-frame-options"]).toBe("DENY"); // el sitio no se mete dentro de otra página (clickjacking)
    expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(cabeceras["permissions-policy"]).toContain("camera=()");
  });

  it("no le saca al navegador el permiso de reproducir audio y video (el juego y la batalla los usan)", async () => {
    const reglas = await nextConfig.headers!();
    const politica = reglas.flatMap((r) => r.headers).find((h) => h.key.toLowerCase() === "permissions-policy")!.value;

    expect(politica).not.toMatch(/autoplay|encrypted-media|fullscreen/); // la presentación usa pantalla completa
  });
});
