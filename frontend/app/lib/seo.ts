import { batallaActiva } from "./funciones";
import { redesConfiguradas } from "./redes";
/** Datos de SEO del sitio: un solo lugar para el título, la descripción, la URL y los datos estructurados. */

const URL_PRODUCCION = "https://bandaoriental.xami.uy";

/** Quita las barras finales; sin valor usa el dominio de producción. */
export function normalizarUrlSitio(valor: string | undefined): string {
  const limpio = valor?.trim().replace(/\/+$/, "");
  return limpio || URL_PRODUCCION;
}

/** URL pública del sitio. Se puede cambiar con NEXT_PUBLIC_SITE_URL (previews, otro dominio). */
export const SITIO_URL = normalizarUrlSitio(process.env.NEXT_PUBLIC_SITE_URL);

/**
 * Código de verificación de Google Search Console (la etiqueta meta "google-site-verification").
 * Se define con NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION; sin valor no se agrega ninguna etiqueta.
 */
export function construirVerificacion(codigo: string | undefined): { google: string } | undefined {
  const limpio = codigo?.trim();
  return limpio ? { google: limpio } : undefined;
}

export const NOMBRE = "Banda Oriental";
export const TITULO = "Banda Oriental: adiviná la canción uruguaya del día";
export const DESCRIPCION =
  "Juego diario de música uruguaya: escuchá un fragmento, descubrí las pistas y adiviná la canción en seis intentos." +
  (batallaActiva() ? " Jugá solo o en batalla con amigos." : "");
export const IDIOMA = "es-UY";
export const COLOR_FONDO = "#fbf8f1";

/**
 * Datos estructurados (schema.org) de la portada.
 * `sameAs` declara los perfiles de redes que están configurados (NEXT_PUBLIC_INSTAGRAM_URL, NEXT_PUBLIC_TIKTOK_URL); sin
 * ninguno no se declara nada: no hay que declarar perfiles que no existen.
 */
export function construirJsonLd() {
  const organizacion = `${SITIO_URL}/#organizacion`;
  const perfiles = redesConfiguradas().map((red) => red.href);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizacion,
        name: NOMBRE,
        url: SITIO_URL,
        logo: { "@type": "ImageObject", url: `${SITIO_URL}/icon-512.png` },
        ...(perfiles.length > 0 && { sameAs: perfiles }),
      },
      {
        "@type": "WebSite",
        "@id": `${SITIO_URL}/#sitio`,
        url: SITIO_URL,
        name: NOMBRE,
        description: DESCRIPCION,
        inLanguage: IDIOMA,
        publisher: { "@id": organizacion },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITIO_URL}/#juego`,
        url: SITIO_URL,
        name: NOMBRE,
        description: DESCRIPCION,
        applicationCategory: "GameApplication",
        genre: "Música",
        operatingSystem: "Web",
        inLanguage: IDIOMA,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "UYU" },
        publisher: { "@id": organizacion },
      },
    ],
  };
}

/** Serializa para meterlo en un <script>: escapa "<" para que ningún texto pueda cerrar la etiqueta. */
export function serializarJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c");
}
