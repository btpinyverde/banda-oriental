import type { Metadata } from "next";
import Link from "next/link";
import { listarArtistas } from "../../lib/archivo-musical";
import { FilaDeArtista, Paginacion } from "../Listados";
import { Aviso, Marco } from "../Marco";
import { cantidad, enteroDe, letraDe, sinVacios, textoDe, type Parametros } from "../utiles";

export const metadata: Metadata = {
  title: "Artistas",
  description: "Los artistas uruguayos del archivo de Banda Oriental, por orden alfabético, con sus discos y canciones.",
  alternates: { canonical: "/archivo/artistas" },
};

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default async function PaginaDeArtistas({ searchParams }: { searchParams: Parametros }) {
  const consulta = await searchParams;
  const q = textoDe(consulta.q);
  const letra = letraDe(consulta.letra);
  const numero = enteroDe(consulta.pagina) ?? 1;
  const artistas = await listarArtistas({ q, letra, pagina: numero });
  return (
    <Marco>
      <h1>Artistas</h1>
      <form method="get" action="/archivo/artistas" role="search" className="archivo-filtros">
        <label>
          Buscar un artista
          <input type="search" name="q" defaultValue={q ?? ""} maxLength={100} />
        </label>
        <button type="submit" className="boton boton--violeta">Buscar</button>
      </form>
      <nav aria-label="Por letra">
        <ul className="archivo-letras">
          <li><Link href="/archivo/artistas" aria-current={!letra ? "true" : undefined}>Todos</Link></li>
          {LETRAS.map((l) => (
            <li key={l}>
              <Link href={`/archivo/artistas?letra=${l}`} aria-current={letra === l ? "true" : undefined}>{l}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {artistas === null ? (
        <Aviso>No pudimos cargar los artistas ahora. Probá de nuevo en un rato.</Aviso>
      ) : artistas.results.length === 0 ? (
        <p className="archivo-aviso">No encontramos artistas con ese criterio.</p>
      ) : (
        <>
          <p className="archivo-musical__bajada">{`${cantidad(artistas.count)} ${artistas.count === 1 ? "artista" : "artistas"}`}</p>
          <ul className="archivo-lista">
            {artistas.results.map((a) => <FilaDeArtista key={a.id} artista={a} />)}
          </ul>
          <Paginacion pagina={artistas.page} paginas={artistas.pages} ruta="/archivo/artistas" parametros={sinVacios({ q, letra })} />
        </>
      )}
    </Marco>
  );
}
