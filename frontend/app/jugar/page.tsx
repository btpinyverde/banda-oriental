import type { Metadata } from "next";
import { esModoDemo } from "../lib/juego/cliente";
import { Footer } from "../ui/Footer";
import { Ondulada } from "../ui/Ondulada";
import { Navbar } from "../ui/Navbar";
import { ColumnaLateral } from "./ColumnaLateral";
import { ColumnaDecorativa, DecoracionAbajo, Garabatos } from "./Decoracion";
import { JuegoDiario } from "./JuegoDiario";
import "./jugar.css";

export const metadata: Metadata = {
  title: "Jugar",
  description: "Escuchá un fragmento, descubrí las pistas y adiviná la canción uruguaya del día en seis intentos.",
  alternates: { canonical: "/jugar" },
};

/**
 * Juego diario. Solo frontend: habla con la API según docs/contrato-api-jugar.md. No publicar hasta que el
 * backend tenga el catálogo (GET /api/songs/) y una canción del día; para probar sin backend, ver
 * NEXT_PUBLIC_JUEGO_DEMO en app/lib/juego/cliente.ts.
 *
 * La columna derecha muestra la racha y las estadísticas reales de este dispositivo (lo jugado queda guardado en el
 * navegador). El ranking del día es una maqueta con datos de ejemplo: solo se muestra en modo demo.
 */
export default function Jugar() {
  const conRankingEjemplo = esModoDemo();

  return (
    <>
      <Navbar actual="/jugar" />
      <main className="jugar">
        <div className="jugar__escenario jugar__escenario--con-lateral">
          <ColumnaDecorativa />
          <div className="jugar__centro">
            <Garabatos />
            <JuegoDiario />
          </div>
          <Ondulada className="jugar__separador" />
          <ColumnaLateral conRankingEjemplo={conRankingEjemplo} />
          <DecoracionAbajo />
        </div>
        <Ondulada className="jugar__ondulada" />
      </main>
      <Footer variante="minimo" />
    </>
  );
}
