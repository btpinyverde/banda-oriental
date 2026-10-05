import type { Metadata } from "next";
import Link from "next/link";
import { filtrosDelArchivo, listarArtistas, listarCanciones, listarDiscos } from "../lib/archivo-musical";
import { NOMBRE } from "../lib/seo";
import { BuscadorDelArchivo } from "./BuscadorDelArchivo";
import { Marco } from "./Marco";
import { cantidad } from "./utiles";

// El catálogo cambia solo cuando se importa: la portada se vuelve a armar como mucho cada diez minutos.
export const revalidate = 600;

const TITULO = "Archivo de música";
const DESCRIPCION = "Buscá y explorá los artistas, discos y canciones uruguayos de Banda Oriental: por nombre, por época o por género.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/archivo" },
  // Next combina la metadata de forma superficial: se repite lo que el sitio ya decía (nombre, idioma).
  openGraph: { title: TITULO, description: DESCRIPCION, siteName: NOMBRE, locale: "es_UY", url: "/archivo" },
  twitter: { title: TITULO, description: DESCRIPCION },
};

const nombreDeDecada = (decada: number) => `Años ${decada < 2000 ? decada - 1900 : decada}`;

export default async function PortadaDelArchivo() {
  const [filtros, artistas, discos, canciones] = await Promise.all([filtrosDelArchivo(), listarArtistas({}), listarDiscos({}), listarCanciones({})]);
  const puertas = [
    { href: "/archivo/artistas", nombre: "Artistas", cuenta: artistas && `${cantidad(artistas.count)} artistas` },
    { href: "/archivo/discos", nombre: "Discos", cuenta: discos && `${cantidad(discos.count)} discos` },
    { href: "/archivo/canciones", nombre: "Canciones", cuenta: canciones && `${cantidad(canciones.count)} canciones` },
  ];
  return (
    <Marco>
      <h1>Archivo</h1>
      <p className="archivo-musical__bajada">Los artistas, discos y canciones uruguayos que están en el juego. Cualquiera de ellos puede ser la canción del día.</p>
      <BuscadorDelArchivo />

      <ul className="archivo-entradas">
        {puertas.map(({ href, nombre, cuenta }) => (
          <li key={href}>
            <Link href={href}>
              <strong>{nombre}</strong>
              {cuenta && <span>{cuenta}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {filtros && filtros.decades.length > 0 && (
        <section aria-labelledby="por-epoca" className="archivo-grupo">
          <h2 id="por-epoca">Explorar por época</h2>
          <ul className="archivo-chips">
            {filtros.decades.map(({ decade, albums }) => (
              <li key={decade}>
                <Link href={`/archivo/discos?decada=${decade}`}>{`${nombreDeDecada(decade)} (${albums})`}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filtros && filtros.genres.length > 0 && (
        <section aria-labelledby="por-genero" className="archivo-grupo">
          <h2 id="por-genero">Explorar por género</h2>
          <ul className="archivo-chips">
            {filtros.genres.slice(0, 24).map(({ genre, albums }) => (
              <li key={genre}>
                <Link href={`/archivo/discos?${new URLSearchParams({ genero: genre })}`}>{`${genre} (${albums})`}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p>
        Los días que ya pasaron del juego diario están en <Link href="/anteriores">juegos anteriores</Link>.
      </p>
    </Marco>
  );
}
