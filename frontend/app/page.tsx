import { artistasDestacados, filtrosDelArchivo, listarArtistas, listarCanciones, rutaDeArtista } from "./lib/archivo-musical";
import { construirJsonLd, serializarJsonLd } from "./lib/seo";
import { ArchivoArtistas } from "./ui/ArchivoArtistas";
import { ComoSeJuega } from "./ui/ComoSeJuega";
import { Footer } from "./ui/Footer";
import { Hero } from "./ui/Hero";
import { ModeCards } from "./ui/ModeCards";
import { Navbar } from "./ui/Navbar";

/**
 * Landing de Banda Oriental.
 *
 * Estado conocido:
 * - Resuelta para desktop (~1384px o más) y para celular (hasta 860px, en una columna centrada de 560px).
 *   De 861px a 1383px (tablets horizontales, notebooks chicas) no hay estilos propios: se ve el desktop
 *   comprimido, sin revisar.
 * - Casi todos los enlaces ya llevan a una página real. /batalla es la pantalla de crear una batalla (detrás de un interruptor). Los de redes
 *   sociales del footer apuntan a "#" hasta tener los perfiles.
 * - "Explorá el archivo" muestra los artistas destacados que se cargan desde el admin (con su foto recortada); si no hay ninguno,
 *   los de más canciones del catálogo; si la API no responde sale vacío.
 * - La tarjeta del juego de la hero es una maqueta decorativa, no el juego.
 */
// El catálogo cambia solo cuando se importa: la portada se vuelve a armar como mucho cada diez minutos.
export const revalidate = 600;

const ARTISTAS_EN_EL_CARRUSEL = 12;

/** "1996–2004", o un solo año si es el mismo, o nada si no se sabe. */
function aniosDe(a: { first_year: number | null; last_year: number | null }): string | undefined {
  if (!a.first_year || !a.last_year) return undefined;
  return a.first_year === a.last_year ? String(a.first_year) : `${a.first_year}–${a.last_year}`;
}
const GENEROS_EN_LOS_CHIPS = 8;

export default async function Home() {
  const [artistas, destacados, canciones, filtros] = await Promise.all([
    listarArtistas({ orden: "songs", porPagina: ARTISTAS_EN_EL_CARRUSEL }),
    artistasDestacados(),
    listarCanciones({}),
    filtrosDelArchivo(),
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializarJsonLd(construirJsonLd()) }}
      />
      <Navbar etiquetaJugar="Jugar la canción de hoy" />
      <main>
        <Hero />
        <ModeCards />
        <ComoSeJuega />
        <ArchivoArtistas
          artistas={
            destacados && destacados.length > 0
              ? destacados.map((a) => ({ id: a.id, nombre: a.name, canciones: a.songs, href: rutaDeArtista(a), anios: aniosDe(a), recorte: a.photo_url || undefined, foto: a.picture_url || undefined }))
              : (artistas?.results ?? []).map((a) => ({ id: a.id, nombre: a.name, canciones: a.songs, href: rutaDeArtista(a), anios: aniosDe(a), foto: a.picture_url || undefined }))
          }
          generos={(filtros?.genres ?? []).slice(0, GENEROS_EN_LOS_CHIPS).map((g) => g.genre)}
          totalCanciones={canciones?.count ?? 0}
        />
      </main>
      <Footer />
    </>
  );
}
