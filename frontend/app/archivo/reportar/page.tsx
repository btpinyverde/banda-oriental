import type { Metadata } from "next";
import { FormularioDeReporte, type Objetivo } from "../FormularioDeReporte";
import { Marco } from "../Marco";
import { enteroDe, textoDe, type Parametros } from "../utiles";
import "../archivo-explorador.css";

export const metadata: Metadata = {
  title: "Avisar de un error",
  description: "Contanos qué dato del archivo de Banda Oriental está mal para corregirlo.",
  robots: { index: false, follow: false },
};

const TIPOS = { artista: "artist", disco: "album", cancion: "song" } as const;

/** Lo que viene en la dirección (tipo, id y nombre) solo se usa para decir sobre qué es el aviso; la API busca el nombre verdadero. */
function objetivoDe(consulta: Awaited<Parametros>): Objetivo | undefined {
  const tipo = TIPOS[textoDe(consulta.tipo) as keyof typeof TIPOS];
  const id = enteroDe(consulta.id);
  const nombre = textoDe(consulta.nombre, 120);
  return tipo && id && nombre ? { tipo, id, nombre } : undefined;
}

export default async function PaginaReportar({ searchParams }: { searchParams: Parametros }) {
  const objetivo = objetivoDe(await searchParams);
  return (
    <Marco>
      <h1>Algo no está bien</h1>
      <p className="archivo-musical__bajada">Revisamos el archivo a mano, pero se nos pasan cosas. Contanos qué viste y lo corregimos.</p>
      <FormularioDeReporte tipo="error" objetivo={objetivo} />
    </Marco>
  );
}
