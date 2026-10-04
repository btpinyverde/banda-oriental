import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import robots from "./robots";
import { SITIO_URL } from "./lib/seo";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lista la portada y el juego, que son las páginas con contenido que se pueden indexar", () => {
    const entradas = sitemap();

    expect(entradas.map((e) => e.url)).toEqual([`${SITIO_URL}/`, `${SITIO_URL}/jugar`]);
  });

  it("no lista páginas personales como el historial", () => {
    expect(sitemap().map((e) => e.url)).not.toContain(`${SITIO_URL}/historial`);
  });
});

describe("robots", () => {
  it("permite rastrear todo el sitio y apunta al sitemap", () => {
    const reglas = robots();

    expect(reglas.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(reglas.sitemap).toBe(`${SITIO_URL}/sitemap.xml`);
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
