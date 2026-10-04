import type { Metadata } from "next";
import { NoEncontrada } from "./no-encontrada/NoEncontrada";
import { Footer } from "./ui/Footer";
import { Navbar } from "./ui/Navbar";
import "./no-encontrada/no-encontrada.css";

export const metadata: Metadata = {
  title: "Página no encontrada",
  description: "El 404 sí existe. Esta página no.",
  robots: { index: false, follow: false },
};

const FOTO_BUS = "/assets/404/bus404.webp";

/**
 * Página de error 404 de todo el sitio. La foto recortada del ómnibus está en public/assets/404/ (hay también un
 * .png de origen, más pesado, que no se usa en la página).
 */
export default function NotFound() {
  return (
    <>
      <Navbar />
      <NoEncontrada fotos={{ bus: FOTO_BUS }} />
      <Footer variante="compacto" />
    </>
  );
}
