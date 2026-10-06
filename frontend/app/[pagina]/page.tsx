import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SLUGS, paginaPorSlug } from "../lib/paginas";

/** Las páginas que tienen ruta propia (app/<nombre>/page.tsx) y no pasan por esta. */
const CON_RUTA_PROPIA = ["contacto"];
import { PaginaDeContenido } from "../ui/PaginaDeContenido";

type Props = { params: Promise<{ pagina: string }> };

// Solo existen las páginas del registro: cualquier otro nombre muestra la página 404.
export const dynamicParams = false;

export async function generateStaticParams() {
  return SLUGS.filter((slug) => !CON_RUTA_PROPIA.includes(slug)).map((pagina) => ({ pagina }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pagina: slug } = await params;
  const pagina = paginaPorSlug(slug);
  if (!pagina) return {};

  return {
    title: pagina.titulo,
    description: pagina.descripcion,
    alternates: { canonical: `/${pagina.slug}` },
    // Las que todavía no tienen contenido no se indexan, para no llenar el buscador de páginas vacías.
    ...(pagina.tipo === "proximamente" && { robots: { index: false, follow: false } }),
  };
}

/**
 * Páginas informativas (cómo funciona, acerca de, contacto, sugerencias, términos, privacidad) y las que todavía
 * están por hacerse. Su contenido está en app/lib/paginas.ts. Las rutas con archivo propio (/jugar, /historial,
 * /compartir) tienen prioridad sobre esta.
 */
export default async function Pagina({ params }: Props) {
  const { pagina: slug } = await params;
  const pagina = paginaPorSlug(slug);
  if (!pagina) notFound();

  return <PaginaDeContenido pagina={pagina} correo={process.env.NEXT_PUBLIC_CORREO_CONTACTO} />;
}
