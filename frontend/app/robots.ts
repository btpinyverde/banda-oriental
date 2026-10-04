import type { MetadataRoute } from "next";
import { AGENTES_DE_IA } from "./lib/seguridad/agentes-ia";
import { SITIO_URL } from "./lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // El sitio es para personas: los rastreadores y agentes de IA pueden leer la portada ("/$" es solo la raíz) y
      // nada más. Esto es un pedido, lo respetan los que se portan bien; proxy.ts frena a los que no.
      { userAgent: AGENTES_DE_IA, allow: "/$", disallow: "/" },
    ],
    sitemap: `${SITIO_URL}/sitemap.xml`,
  };
}
