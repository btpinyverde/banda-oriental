import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { batallaActiva } from "../lib/funciones";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { CrearBatalla } from "./CrearBatalla";
import "./batalla.css";

export const metadata: Metadata = {
  title: "Creá una batalla",
  // Es una herramienta, no contenido: no aporta nada en el buscador.
  robots: { index: false, follow: false },
};

export default function PaginaBatalla() {
  // Mientras el interruptor esté apagado la página no existe (ver lib/funciones.ts).
  if (!batallaActiva()) notFound();
  return (
    <>
      <Navbar actual="/batalla" />
      <CrearBatalla />
      <Footer variante="compacto" />
    </>
  );
}
