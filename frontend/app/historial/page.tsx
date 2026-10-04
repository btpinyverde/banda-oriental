import type { Metadata } from "next";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { Historial } from "./Historial";
import "./historial.css";

export const metadata: Metadata = {
  title: "Mi historial",
  description: "Tus partidas del juego diario y tus estadísticas.",
  // Es personal y vive en el dispositivo de cada persona: no tiene sentido indexarla.
  robots: { index: false, follow: false },
};

export default function PaginaHistorial() {
  return (
    <>
      <Navbar />
      <Historial />
      <Footer variante="compacto" />
    </>
  );
}
