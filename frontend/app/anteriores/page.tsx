import type { Metadata } from "next";
import { obtenerDias } from "../lib/anteriores";
import { NOMBRE } from "../lib/seo";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { ListaDeAnteriores } from "./ListaDeAnteriores";
import "./anteriores.css";

// Los días nuevos aparecen a medianoche: la página se vuelve a armar como mucho cada diez minutos.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Juegos anteriores",
  description:
    "Todas las canciones uruguayas de los días que ya pasaron en Banda Oriental, con su artista y su disco. Para repasar, descubrir y compartir.",
  alternates: { canonical: "/anteriores" },
  // Next combina la metadata de forma superficial: se repite lo que el sitio ya decía (nombre, idioma).
  openGraph: { title: "Juegos anteriores", siteName: NOMBRE, locale: "es_UY", url: "/anteriores" },
  twitter: { title: "Juegos anteriores" },
};

export default async function PaginaAnteriores() {
  const dias = await obtenerDias();
  return (
    <>
      <Navbar actual="/anteriores" />
      <ListaDeAnteriores dias={dias} />
      <Footer variante="compacto" />
    </>
  );
}
