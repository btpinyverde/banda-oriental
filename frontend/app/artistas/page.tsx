import type { Metadata } from "next";
import { obtenerDiscos, porArtista } from "../lib/catalogo";
import { PaginaExplorar } from "../explorar/PaginaExplorar";

// El catálogo cambia solo cuando se importa: se vuelve a armar como mucho cada diez minutos.
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Artistas",
  description: "Los artistas uruguayos que están en Banda Oriental, con sus discos y la cantidad de canciones de cada uno.",
  alternates: { canonical: "/artistas" },
};

export default async function PaginaArtistas() {
  const discos = await obtenerDiscos();
  return (
    <PaginaExplorar
      actual="/artistas"
      titulo="Artistas"
      bajada="Los artistas uruguayos que están en el juego, con sus discos. Cualquiera de sus canciones puede ser la del día."
      grupos={discos && porArtista(discos)}
      buscable
    />
  );
}
