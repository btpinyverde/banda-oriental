import { ArchivoArtistas } from "./ui/ArchivoArtistas";
import { ARTISTAS_EJEMPLO, GENEROS_EJEMPLO, TOTAL_CANCIONES_EJEMPLO } from "./ui/archivo-ejemplo";
import { ComoSeJuega } from "./ui/ComoSeJuega";
import { Footer } from "./ui/Footer";
import { Hero } from "./ui/Hero";
import { ModeCards } from "./ui/ModeCards";
import { Navbar } from "./ui/Navbar";

/**
 * Landing de Banda Oriental.
 *
 * Estado conocido (primera versión publicada):
 * - Solo está resuelta para desktop (~1384px o más). Todavía no hay estilos para tablet ni celular.
 * - Varios enlaces apuntan a rutas que aún no existen y dan 404: /jugar, /batalla, /archivo, /ranking,
 *   /acerca, /login, /artistas, /epocas, /generos, /como-funciona, /contacto, /sugerencias, /terminos,
 *   /privacidad. Los de redes sociales del footer apuntan a "#" hasta tener los perfiles.
 * - "Explorá el archivo" usa datos de ejemplo (ver ui/archivo-ejemplo.ts), no el catálogo real.
 * - La tarjeta del juego de la hero es una maqueta decorativa, no el juego.
 */
export default function Home() {
  return (
    <>
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
      </main>
      <Footer />
    </>
  );
}
