import { describe, expect, it } from "vitest";
import {
  DESCRIPCION,
  SITIO_URL,
  TITULO,
  construirJsonLd,
  normalizarUrlSitio,
  serializarJsonLd,
} from "./seo";

describe("textos del sitio", () => {
  it("el título entra en el resultado de búsqueda (60 caracteres o menos) y nombra el juego", () => {
    expect(TITULO.length).toBeLessThanOrEqual(60);
    expect(TITULO).toContain("Banda Oriental");
  });

  it("la descripción tiene entre 120 y 160 caracteres", () => {
    expect(DESCRIPCION.length).toBeGreaterThanOrEqual(120);
    expect(DESCRIPCION.length).toBeLessThanOrEqual(160);
  });
});

describe("normalizarUrlSitio", () => {
  it("quita las barras finales", () => {
    expect(normalizarUrlSitio("https://ejemplo.uy/")).toBe("https://ejemplo.uy");
    expect(normalizarUrlSitio("https://ejemplo.uy///")).toBe("https://ejemplo.uy");
  });

  it("usa el dominio de producción cuando no hay valor", () => {
    expect(normalizarUrlSitio(undefined)).toBe("https://bandaoriental.xami.uy");
    expect(normalizarUrlSitio("   ")).toBe("https://bandaoriental.xami.uy");
  });
});

describe("construirJsonLd", () => {
  const grafo = construirJsonLd()["@graph"];
  const tipo = (nombre: string) => grafo.find((nodo) => nodo["@type"] === nombre);

  it("describe la organización, el sitio y la aplicación web", () => {
    expect(tipo("Organization")).toBeDefined();
    expect(tipo("WebSite")).toBeDefined();
    expect(tipo("WebApplication")).toBeDefined();
  });

  it("declara el juego como gratuito, de la categoría juegos y en español de Uruguay", () => {
    const juego = tipo("WebApplication") as Record<string, unknown>;

    expect(juego.applicationCategory).toBe("GameApplication");
    expect(juego.isAccessibleForFree).toBe(true);
    expect(juego.inLanguage).toBe("es-UY");
    expect(juego.offers).toMatchObject({ "@type": "Offer", price: "0" });
  });

  it("usa solo URLs absolutas del sitio", () => {
    const urls = JSON.stringify(construirJsonLd()).match(/https?:\/\/[^"]+/g) ?? [];

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(SITIO_URL) || url === "https://schema.org").toBe(true);
    }
  });

  it("no inventa perfiles de redes sociales mientras los enlaces sean provisorios", () => {
    expect(JSON.stringify(construirJsonLd())).not.toContain("sameAs");
  });
});

describe("serializarJsonLd", () => {
  it("escapa el signo < para que un texto no pueda cerrar la etiqueta script", () => {
    const salida = serializarJsonLd({ nombre: "</script><script>alert(1)</script>" });

    expect(salida).not.toContain("<");
    expect(JSON.parse(salida).nombre).toBe("</script><script>alert(1)</script>");
  });
});
