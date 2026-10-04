// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

const NAVEGADOR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const pedir = (ruta: string, agente: string) =>
  proxy(new NextRequest(`https://bandaoriental.xami.uy${ruta}`, { headers: { "user-agent": agente } }));

describe("proxy: el sitio es para personas", () => {
  it("un agente de IA puede leer la portada", () => {
    const respuesta = pedir("/", "Mozilla/5.0 (compatible; GPTBot/1.1)");

    expect(respuesta.status).toBe(200);
  });

  it.each(["/jugar", "/historial", "/login", "/cuenta", "/cuenta/entrar", "/acerca", "/privacidad", "/compartir/story"])(
    "pero no puede abrir %s",
    (ruta) => {
      const respuesta = pedir(ruta, "Mozilla/5.0 (compatible; ClaudeBot/1.0)");

      expect(respuesta.status).toBe(403);
    },
  );

  it("el rechazo es claro y no se guarda en ninguna caché compartida", async () => {
    const respuesta = pedir("/jugar", "ChatGPT-User/1.0");

    expect(await respuesta.text()).toContain("solo para personas");
    expect(respuesta.headers.get("cache-control")).toContain("no-store");
  });

  it.each(["/jugar", "/historial", "/cuenta", "/acerca"])("una persona abre %s sin problemas", (ruta) => {
    expect(pedir(ruta, NAVEGADOR).status).toBe(200);
  });

  it("los buscadores comunes no se tocan (el sitio sigue apareciendo en Google)", () => {
    expect(pedir("/jugar", "Mozilla/5.0 (compatible; Googlebot/2.1)").status).toBe(200);
  });

  it("no se mete con los archivos que la portada necesita ni con robots y sitemap", () => {
    const patron = new RegExp(`^${config.matcher[0]}$`);

    for (const libre of ["/_next/static/chunks/a.js", "/assets/hero-blob-yellow.svg", "/robots.txt", "/sitemap.xml", "/favicon.ico"]) {
      expect(patron.test(libre), libre).toBe(false);
    }
    for (const controlada of ["/", "/jugar", "/cuenta/entrar", "/compartir/story"]) {
      expect(patron.test(controlada), controlada).toBe(true);
    }
  });
});
