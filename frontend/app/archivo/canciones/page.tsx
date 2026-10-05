import type { Metadata } from "next";
import { listarCanciones } from "../../lib/archivo-musical";
import { FilaDeCancion, Paginacion } from "../Listados";
import { Aviso, Marco } from "../Marco";
import { cantidad, enteroDe, sinVacios, textoDe, type Parametros } from "../utiles";

export const metadata: Metadata = {
  title: "Canciones",
  description: "Las canciones uruguayas del archivo de Banda Oriental, con su artista, su disco y su año.",
  alternates: { canonical: "/archivo/canciones" },
};

export default async function PaginaDeCanciones({ searchParams }: { searchParams: Parametros }) {
  const consulta = await searchParams;
  const q = textoDe(consulta.q);
  const artista = enteroDe(consulta.artista);
  const disco = enteroDe(consulta.disco);
  const decada = enteroDe(consulta.decada);
  const genero = textoDe(consulta.genero, 60);
  const numero = enteroDe(consulta.pagina) ?? 1;
  const canciones = await listarCanciones({ q, artista, disco, decada, genero, pagina: numero });
  return (
    <Marco>
      <h1>Canciones</h1>
      <form method="get" action="/archivo/canciones" role="search" className="archivo-filtros">
        <label>
          Buscar una canción
          <input type="search" name="q" defaultValue={q ?? ""} maxLength={100} />
        </label>
        {artista && <input type="hidden" name="artista" value={artista} />}
        {disco && <input type="hidden" name="disco" value={disco} />}
        {decada && <input type="hidden" name="decada" value={decada} />}
        {genero && <input type="hidden" name="genero" value={genero} />}
        <button type="submit" className="boton boton--violeta">Buscar</button>
      </form>
      {canciones === null ? (
        <Aviso>No pudimos cargar las canciones ahora. Probá de nuevo en un rato.</Aviso>
      ) : canciones.results.length === 0 ? (
        <p className="archivo-aviso">No encontramos canciones con ese criterio.</p>
      ) : (
        <>
          <p className="archivo-musical__bajada">{`${cantidad(canciones.count)} ${canciones.count === 1 ? "canción" : "canciones"}`}</p>
          <ul className="archivo-lista">
            {canciones.results.map((c) => <FilaDeCancion key={c.id} cancion={c} />)}
          </ul>
          <Paginacion pagina={canciones.page} paginas={canciones.pages} ruta="/archivo/canciones" parametros={sinVacios({ q, artista, disco, decada, genero })} />
        </>
      )}
    </Marco>
  );
}
