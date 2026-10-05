import type { Metadata } from "next";
import { Footer } from "../../ui/Footer";
import { Navbar } from "../../ui/Navbar";
import { Sala } from "../Sala";
import "../../jugar/jugar.css"; // el buscador de canciones es el del juego diario y trae sus estilos
import "../batalla.css";

export const metadata: Metadata = {
  title: "Batalla",
  // El enlace de una sala es privado de quienes lo reciben.
  robots: { index: false, follow: false },
};

export default async function PaginaSala({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <Navbar />
      <Sala code={code} />
      <Footer variante="compacto" />
    </>
  );
}
