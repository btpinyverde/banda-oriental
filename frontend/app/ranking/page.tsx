import type { Metadata } from "next";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { Ranking } from "./Ranking";
import "./ranking.css";

export const metadata: Metadata = {
  title: "Ranking",
  description: "Los mejores puntajes de Banda Oriental, el juego diario de canciones uruguayas: del día, de la semana, del mes y de siempre.",
  alternates: { canonical: "/ranking" },
};

export default function PaginaRanking() {
  return (
    <>
      <Navbar actual="/ranking" />
      <Ranking />
      <Footer variante="compacto" />
    </>
  );
}
