import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import robots from "./robots";
import { SITIO_URL } from "./lib/seo";

describe("robots", () => {
  type Regla = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };
  const reglas = () => [robots().rules].flat() as Regla[];

  it("permite rastrear todo el sitio a los buscadores comunes y apunta al sitemap", () => {
    const general = reglas().find((regla) => regla.userAgent === "*");

    expect(general).toEqual({ userAgent: "*", allow: "/" });
    expect(robots().sitemap).toBe(`${SITIO_URL}/sitemap.xml`);
  });

  it("a los rastreadores y agentes de IA les deja leer solo la portada", () => {
    const deIA = reglas().find((regla) => Array.isArray(regla.userAgent) && regla.userAgent.includes("GPTBot"));

    expect(deIA).toBeDefined();
    expect(deIA?.allow).toBe("/$");
    expect(deIA?.disallow).toBe("/");
    for (const agente of ["ClaudeBot", "Claude-User", "ChatGPT-User", "PerplexityBot", "CCBot", "Google-Extended", "Bytespider"]) {
      expect(deIA?.userAgent).toContain(agente);
    }
  });
});

describe("manifest", () => {
  it("describe la app instalable con nombre, inicio, colores e íconos de 192 y 512 px", () => {
    const datos = manifest();

    expect(datos.name).toBe("Banda Oriental");
    expect(datos.start_url).toBe("/");
    expect(datos.display).toBe("standalone");
    expect(datos.lang).toBe("es-UY");
    expect(datos.background_color).toBeTruthy();
    expect(datos.theme_color).toBeTruthy();
    expect(datos.icons?.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });
});
