import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaDeCancion, idDeFicha, listarCanciones, rutaDeArtista, rutaDeCancion, rutaDeDisco, slug } from "../../../lib/archivo-musical";
import { NOMBRE } from "../../../lib/seo";
import { FilaDeCancion, duracion } from "../../Listados";
import { Marco } from "../../Marco";

type Props = { params: Promise<{ ficha: string }> };

export const revalidate = 600;
const NO_INDEXAR = { index: false, follow: false } as const;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idDeFicha((await params).ficha);
  const cancion = id === null ? "no-encontrado" : await fichaDeCancion(id);
  if (cancion === "no-encontrado") return { title: "Canción no encontrada", robots: NO_INDEXAR };
  if (cancion === null) return { title: "Canciones" };
  const titulo = `${cancion.title}, de ${cancion.artist.name}`;
  const descripcion = `${cancion.title}, de ${cancion.artist.name}, del disco ${cancion.album.name}${cancion.album.year ? ` (${cancion.album.year})` : ""}.`;
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: rutaDeCancion(cancion) },
    openGraph: { title: titulo, description: descripcion, siteName: NOMBRE, locale: "es_UY", url: rutaDeCancion(cancion) },
    twitter: { title: titulo, description: descripcion },
  };
}

export default async function FichaDeLaCancion({ params }: Props) {
  const id = idDeFicha((await params).ficha);
  if (id === null) notFound();
  const cancion = await fichaDeCancion(id);
  if (cancion === "no-encontrado") notFound();
  if (cancion === null) throw new Error("No se pudo cargar la canción");

  // Las que se llaman igual (de otros artistas o en otros discos): el archivo las distingue por su artista y su disco.
  const parecidas = await listarCanciones({ q: cancion.title });
  const mismas = (parecidas?.results ?? []).filter((c) => c.id !== cancion.id && slug(c.title) === slug(cancion.title));

  return (
    <Marco>
      <p className="archivo-migas"><Link href="/archivo/canciones">← Canciones</Link></p>
      <header className="archivo-ficha">
        <h1>{cancion.title}</h1>
        <p className="archivo-ficha__datos">
          <Link href={rutaDeArtista(cancion.artist)}>{cancion.artist.name}</Link>
          {" · "}
          <Link href={rutaDeDisco(cancion.album)}>{`${cancion.album.name}${cancion.album.year ? ` (${cancion.album.year})` : ""}`}</Link>
          {cancion.album.genre && ` · ${cancion.album.genre}`}
          {duracion(cancion.duration_seconds) && ` · ${duracion(cancion.duration_seconds)}`}
        </p>
      </header>

      {cancion.played_on.length > 0 && (
        <section aria-labelledby="dias" className="archivo-grupo">
          <h2 id="dias">Fue la canción del día</h2>
          <ul className="archivo-chips">
            {cancion.played_on.map((dia) => (
              <li key={dia}><Link href={`/anteriores/${dia}`}>{dia}</Link></li>
            ))}
          </ul>
        </section>
      )}

      {mismas.length > 0 && (
        <section role="region" aria-label="Otras canciones con el mismo título" className="archivo-grupo">
          <h2>Otras canciones con el mismo título</h2>
          <ul className="archivo-lista">
            {mismas.map((c) => <FilaDeCancion key={c.id} cancion={c} />)}
          </ul>
        </section>
      )}
    </Marco>
  );
}
