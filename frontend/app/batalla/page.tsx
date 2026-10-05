import type { Metadata } from "next";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { PuertaDeBatalla } from "./PuertaDeBatalla";
import "./batalla.css";

export const metadata: Metadata = {
  // Título genérico: a quien no puede crear salas no le tiene que decir que existe el modo.
  title: "Banda Oriental",
  robots: { index: false, follow: false },
};

export default function PaginaBatalla() {
  // Quién puede crear salas lo decide el servidor (ver PuertaDeBatalla); entrar a una sala con su enlace está abierto.
  return (
    <>
      <Navbar />
      <PuertaDeBatalla />
      <Footer variante="compacto" />
    </>
  );
}
