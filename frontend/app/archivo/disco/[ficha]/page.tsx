import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fichaDeDisco, idDeFicha, rutaDeArtista, rutaDeCancion, rutaDeDisco } from "../../../lib/archivo-musical";
import { NOMBRE } from "../../../lib/seo";
import { duracion } from "../../Listados";
import { Marco } from "../../Marco";

type Props = { params: Promise<{ ficha: string }> };

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
    <Marco>
      <p className="archivo-migas"><Link href="/archivo/discos">← Discos</Link></p>
      <header className="archivo-ficha">
        {disco.cover_art_url && <img className="archivo-ficha__portada" src={disco.cover_art_url} alt={`Tapa de ${disco.name}`} width={160} height={160} loading="lazy" />}
        <h1>{disco.name}</h1>
        <p className="archivo-ficha__datos">
          <Link href={rutaDeArtista(disco.artist)}>{disco.artist.name}</Link>
          {[disco.year ? String(disco.year) : "", disco.genre].filter(Boolean).map((t) => ` · ${t}`).join("")}
        </p>
      </header>
      <section aria-labelledby="canciones" className="archivo-grupo">
        <h2 id="canciones">Canciones</h2>
        <ol className="archivo-lista">
          {disco.songs.map((c) => (
            <li key={c.id} className="archivo-fila">
              <Link href={rutaDeCancion(c)} className="archivo-fila__titulo">{c.title}</Link>
              {duracion(c.duration_seconds) && <span className="archivo-fila__datos">{duracion(c.duration_seconds)}</span>}
            </li>
          ))}
        </ol>
      </section>
    </Marco>
  );
}
