import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaDeArtista, idDeFicha, rutaDeArtista } from "../../../lib/archivo-musical";
import { NOMBRE } from "../../../lib/seo";
import { FilaDeDisco } from "../../Listados";
import { FotoDelArtista } from "../../../ui/FotoDelArtista";
import { Marco } from "../../Marco";

type Props = { params: Promise<{ ficha: string }> };

// El catálogo cambia solo cuando se importa: cada ficha se arma la primera vez que la piden y se renueva (ISR).
export const revalidate = 600;
const NO_INDEXAR = { index: false, follow: false } as const;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idDeFicha((await params).ficha);
  const artista = id === null ? "no-encontrado" : await fichaDeArtista(id);
  if (artista === "no-encontrado") return { title: "Artista no encontrado", robots: NO_INDEXAR };
  if (artista === null) return { title: "Artistas" };
  const descripcion = `${artista.name}: ${artista.albums.length} ${artista.albums.length === 1 ? "disco" : "discos"} y ${artista.songs} ${artista.songs === 1 ? "canción" : "canciones"} en el archivo de Banda Oriental.`;
  return {
    title: artista.name,
    description: descripcion,
    alternates: { canonical: rutaDeArtista(artista) },
    openGraph: { title: artista.name, description: descripcion, siteName: NOMBRE, locale: "es_UY", url: rutaDeArtista(artista) },
    twitter: { title: artista.name, description: descripcion },
  };
}

export default async function FichaDelArtista({ params }: Props) {
  const id = idDeFicha((await params).ficha);
  if (id === null) notFound();
  const artista = await fichaDeArtista(id);
  if (artista === "no-encontrado") notFound();
  // Si la API no responde la página falla (no se guarda un aviso con 200 en la caché): Next sigue sirviendo la última buena.
  if (artista === null) throw new Error("No se pudo cargar el artista");

  const anios = [artista.first_year, artista.last_year].filter(Boolean);
  return (
    <Marco>
      <p className="archivo-migas"><Link href="/archivo/artistas">← Artistas</Link></p>
      <header className="archivo-ficha">
        <FotoDelArtista nombre={artista.name} foto={artista.picture_url} clase="archivo-ficha__foto" />
        <h1>{artista.name}</h1>
        <p className="archivo-ficha__datos">
          {[`${artista.albums.length} ${artista.albums.length === 1 ? "disco" : "discos"}`, `${artista.songs} ${artista.songs === 1 ? "canción" : "canciones"}`, anios.length ? [...new Set(anios)].join("–") : ""].filter(Boolean).join(" · ")}
        </p>
      </header>
      <section aria-labelledby="discos" className="archivo-grupo">
        <h2 id="discos">Discos</h2>
        <ul className="archivo-lista">
          {artista.albums.map((d) => <FilaDeDisco key={d.id} disco={d} />)}
        </ul>
        <Link href={`/archivo/canciones?artista=${artista.id}`}>Ver todas sus canciones</Link>
      </section>
    </Marco>
  );
}
