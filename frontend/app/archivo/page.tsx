import type { Metadata } from "next";
import { obtenerDias } from "../lib/archivo";
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
