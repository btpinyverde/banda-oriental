import type { Metadata } from "next";
import { obtenerDiscos, porDecada } from "../lib/catalogo";
import { PaginaExplorar } from "../explorar/PaginaExplorar";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Épocas",
  description: "La música uruguaya de Banda Oriental ordenada por década, de los discos más nuevos a los más viejos.",
  alternates: { canonical: "/epocas" },
};

export default async function PaginaEpocas() {
  const discos = await obtenerDiscos();
  return (
    <PaginaExplorar
      actual="/epocas"
      titulo="Épocas"
      bajada="Los discos del juego ordenados por década, de los más nuevos a los más viejos."
      grupos={discos && porDecada(discos)}
      conArtista
    />
  );
}
