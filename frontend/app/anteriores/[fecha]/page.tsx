import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerDia } from "../../lib/anteriores";
import { diaYMes, fechaLarga } from "../../lib/fechas";
import { NOMBRE } from "../../lib/seo";
import { Footer } from "../../ui/Footer";
import { Navbar } from "../../ui/Navbar";
import "../anteriores.css";
import { VistaDelDia } from "./VistaDelDia";

type Props = { params: Promise<{ fecha: string }> };

// Un día vencido no cambia: se arma una vez y se renueva como mucho cada diez minutos.
export const revalidate = 600;

const NO_INDEXAR = { index: false, follow: false } as const;

// Ningún día se arma de antemano (no hace falta esperar a la API al armar el sitio): cada uno se arma la primera vez
// que lo piden, queda en caché y se renueva (ISR).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fecha } = await params;
  const dia = await obtenerDia(fecha);
  if (dia === "no-encontrado") return { title: "Día no encontrado", robots: NO_INDEXAR };
  // Si la API falla la página falla (ver abajo): no se marca el día como no indexable por un problema pasajero.
  if (dia === null) return { title: "Juegos anteriores" };

  const titulo = `Canción del ${diaYMes(fecha)} de ${fecha.slice(0, 4)}: ${dia.song_title}, de ${dia.artist}`;
  const descripcion = `La canción uruguaya del día ${fechaLarga(fecha)} en Banda Oriental fue "${dia.song_title}", de ${dia.artist}, del disco ${dia.album}.`;
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/anteriores/${fecha}` },
    // Next combina la metadata de forma superficial: al definir `openGraph` y `twitter` se pierde lo que el sitio ya
    // decía (nombre, idioma, título genérico), así que se repite acá.
    openGraph: { title: titulo, description: descripcion, type: "article", siteName: NOMBRE, locale: "es_UY", url: `/anteriores/${fecha}` },
    twitter: { title: titulo, description: descripcion },
  };
}

export default async function PaginaDelDia({ params }: Props) {
  const { fecha } = await params;
  const dia = await obtenerDia(fecha);
  if (dia === "no-encontrado") notFound();

  // Si la API no responde no se muestra un aviso con 200 (se guardaría en caché y los buscadores lo verían): la página
  // falla, Next sigue sirviendo la última versión buena y, si no hay ninguna, da un error temporal que se reintenta.
  if (dia === null) throw new Error("No se pudo cargar el día anterior");

  return (
    <>
      <Navbar actual="/anteriores" />
      <VistaDelDia dia={dia} />
      <Footer variante="compacto" />
    </>
  );
}
