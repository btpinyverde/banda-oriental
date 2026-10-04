import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerDia } from "../../lib/archivo";
import { diaYMes, fechaLarga } from "../../lib/fechas";
import { Footer } from "../../ui/Footer";
import { Navbar } from "../../ui/Navbar";
import "../archivo.css";
import { VistaDelDia } from "./VistaDelDia";

type Props = { params: Promise<{ fecha: string }> };

// Un día vencido no cambia: se arma una vez y se renueva como mucho cada diez minutos.
export const revalidate = 600;

const NO_INDEXAR = { index: false, follow: false } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fecha } = await params;
  const dia = await obtenerDia(fecha);
  if (dia === "no-encontrado") return { title: "Día no encontrado", robots: NO_INDEXAR };
  if (dia === null) return { title: "Archivo de canciones", robots: NO_INDEXAR };

  const titulo = `Canción del ${diaYMes(fecha)} de ${fecha.slice(0, 4)}: ${dia.song_title}, de ${dia.artist}`;
  const descripcion = `La canción uruguaya del día ${fechaLarga(fecha)} en Banda Oriental fue "${dia.song_title}", de ${dia.artist}, del disco ${dia.album}.`;
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: `/archivo/${fecha}` },
    openGraph: { title: titulo, description: descripcion, type: "article" },
  };
}

export default async function PaginaDelDia({ params }: Props) {
  const { fecha } = await params;
  const dia = await obtenerDia(fecha);
  if (dia === "no-encontrado") notFound();

  return (
    <>
      <Navbar actual="/archivo" />
      {dia === null ? (
        <main className="archivo-publico">
          <div className="archivo-publico__aviso" role="alert">
            <p>No pudimos cargar este día ahora. Probá de nuevo en un rato.</p>
          </div>
        </main>
      ) : (
        <VistaDelDia dia={dia} />
      )}
      <Footer variante="compacto" />
    </>
  );
}
