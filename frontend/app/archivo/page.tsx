import type { Metadata } from "next";
import { obtenerDias } from "../lib/archivo";
import { NOMBRE } from "../lib/seo";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { ListaDelArchivo } from "./ListaDelArchivo";
import "./archivo.css";

// Los días nuevos aparecen a medianoche: la página se vuelve a armar como mucho cada diez minutos.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Archivo de canciones",
  description:
    "Todas las canciones uruguayas de los días que ya pasaron en Banda Oriental, con su artista y su disco. Un archivo para repasar, descubrir y compartir.",
  alternates: { canonical: "/archivo" },
  // Next combina la metadata de forma superficial: se repite lo que el sitio ya decía (nombre, idioma).
  openGraph: { title: "Archivo de canciones", siteName: NOMBRE, locale: "es_UY", url: "/archivo" },
  twitter: { title: "Archivo de canciones" },
};

export default async function PaginaArchivo() {
  const dias = await obtenerDias();
  return (
    <>
      <Navbar actual="/archivo" />
      <ListaDelArchivo dias={dias} />
      <Footer variante="compacto" />
    </>
  );
}
