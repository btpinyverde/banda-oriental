import { construirJsonLd, serializarJsonLd } from "./lib/seo";
import { ArchivoArtistas } from "./ui/ArchivoArtistas";
import { ARTISTAS_EJEMPLO, GENEROS_EJEMPLO, TOTAL_CANCIONES_EJEMPLO } from "./ui/archivo-ejemplo";
import { ComoSeJuega } from "./ui/ComoSeJuega";
import { Footer } from "./ui/Footer";
import { Hero } from "./ui/Hero";
import { LlamadoMovil } from "./ui/LlamadoMovil";
import { ModeCards } from "./ui/ModeCards";
import { Navbar } from "./ui/Navbar";

/**
 * Landing de Banda Oriental.
 *
 * Estado conocido:
 * - Resuelta para desktop (~1384px o más) y para celular (hasta 860px, en una columna centrada de 560px).
 *   De 861px a 1383px (tablets horizontales, notebooks chicas) no hay estilos propios: se ve el desktop
 *   comprimido, sin revisar.
 * - Varios enlaces apuntan a rutas que aún no existen y dan 404: /jugar, /batalla, /archivo, /ranking,
 *   /acerca, /login, /artistas, /epocas, /generos, /como-funciona, /contacto, /sugerencias, /terminos,
 *   /privacidad. Los de redes sociales del footer apuntan a "#" hasta tener los perfiles.
 * - "Explorá el archivo" usa datos de ejemplo (ver ui/archivo-ejemplo.ts), no el catálogo real.
 * - La tarjeta del juego de la hero es una maqueta decorativa, no el juego.
 * - En celular, "Crear cuenta gratis" (ui/LlamadoMovil) enlaza a /login, que no existe: el diseño del
 *   proyecto todavía no tiene cuentas.
 */
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializarJsonLd(construirJsonLd()) }}
      />
      <Navbar />
      <main>
        <Hero />
        <ModeCards />
        <ComoSeJuega />
        <ArchivoArtistas
          artistas={ARTISTAS_EJEMPLO}
          generos={GENEROS_EJEMPLO}
          totalCanciones={TOTAL_CANCIONES_EJEMPLO}
        />
        <LlamadoMovil />
      </main>
      <Footer />
    </>
  );
}
