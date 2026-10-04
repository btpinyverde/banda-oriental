import type { Metadata } from "next";
import { obtenerDiscos, porGenero } from "../lib/catalogo";
import { PaginaExplorar } from "../explorar/PaginaExplorar";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Géneros",
  description: "La música uruguaya de Banda Oriental agrupada por género, del que tiene más discos al que tiene menos.",
  alternates: { canonical: "/generos" },
};

export default async function PaginaGeneros() {
  const discos = await obtenerDiscos();
  return (
    <PaginaExplorar
      actual="/generos"
      titulo="Géneros"
      bajada="Los discos del juego agrupados por género. No todos tienen el género cargado: esos van al final."
      grupos={discos && porGenero(discos)}
      conArtista
      buscable
    />
  );
}
