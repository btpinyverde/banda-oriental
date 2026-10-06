import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaDeDisco, idDeFicha, rutaDeCancion, rutaDeDisco } from "../../../lib/archivo-musical";
import { NOMBRE } from "../../../lib/seo";
import { duracion } from "../../Listados";
import { CabeceraDeDisco } from "../../CabeceraDeDisco";
import { Marco } from "../../Marco";

type Props = { params: Promise<{ ficha: string }> };

import "../../archivo-explorador.css";

export const revalidate = 600;
const NO_INDEXAR = { index: false, follow: false } as const;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idDeFicha((await params).ficha);
  const disco = id === null ? "no-encontrado" : await fichaDeDisco(id);
  if (disco === "no-encontrado") return { title: "Disco no encontrado", robots: NO_INDEXAR };
  if (disco === null) return { title: "Discos" };
  const titulo = `${disco.name}, de ${disco.artist.name}`;
  const descripcion = `${disco.name}${disco.year ? ` (${disco.year})` : ""}, de ${disco.artist.name}: ${disco.songs.length} ${disco.songs.length === 1 ? "canción" : "canciones"} en el archivo de Banda Oriental.`;
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: rutaDeDisco(disco) },
    openGraph: { title: titulo, description: descripcion, siteName: NOMBRE, locale: "es_UY", url: rutaDeDisco(disco) },
    twitter: { title: titulo, description: descripcion },
  };
}

export default async function FichaDelDisco({ params }: Props) {
  const id = idDeFicha((await params).ficha);
  if (id === null) notFound();
  const disco = await fichaDeDisco(id);
  if (disco === "no-encontrado") notFound();
  if (disco === null) throw new Error("No se pudo cargar el disco");

  return (
    <Marco ancho pie="completo">
      <CabeceraDeDisco
        id={disco.id}
        nombre={disco.name}
        artista={disco.artist}
        anio={disco.year}
        genero={disco.genre}
        canciones={disco.songs.length}
        tapa={disco.cover_art_url.startsWith("https://") ? disco.cover_art_url : undefined}
      />
      <section aria-labelledby="canciones">
        <h2 className="archivo-seccion" id="canciones">
          Canciones
        </h2>
        <ol className="pistas">
          {disco.songs.map((c, i) => (
            <li key={c.id} className="pista">
              <span className="pista__numero" aria-hidden="true">
                {i + 1}
              </span>
              <Link href={rutaDeCancion(c)} className="pista__titulo">
                {c.title}
              </Link>
              {duracion(c.duration_seconds) && <span className="pista__duracion">{duracion(c.duration_seconds)}</span>}
            </li>
          ))}
        </ol>
      </section>
    </Marco>
  );
}
