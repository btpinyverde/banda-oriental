import type { Metadata } from "next";
import Link from "next/link";
import { listarArtistas } from "../../lib/archivo-musical";
import { BarraDeFiltros } from "../BarraDeFiltros";
import { cantidadesDelArchivo } from "../cantidades";
import { EncabezadoDelArchivo } from "../EncabezadoDelArchivo";
import { Aviso, Marco } from "../Marco";
import { PaginasNumeradas } from "../PaginasNumeradas";
import { TarjetaDeArtista } from "../TarjetasDelArchivo";
import { cantidad, enteroDe, letraDe, sinVacios, textoDe, type Parametros } from "../utiles";
import "../archivo-explorador.css";

export const metadata: Metadata = {
  title: "Artistas",
  description: "Los artistas uruguayos del archivo de Banda Oriental, por orden alfabético, con sus discos y canciones.",
  alternates: { canonical: "/archivo/artistas" },
};

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const POR_PAGINA = 15; // cinco por fila, tres filas

export default async function PaginaDeArtistas({ searchParams }: { searchParams: Parametros }) {
  const consulta = await searchParams;
  const q = textoDe(consulta.q);
  const letra = letraDe(consulta.letra);
  const numero = enteroDe(consulta.pagina) ?? 1;
  const [artistas, cantidades] = await Promise.all([listarArtistas({ q, letra, pagina: numero, porPagina: POR_PAGINA }), cantidadesDelArchivo()]);
  return (
    <Marco ancho pie="completo">
      <EncabezadoDelArchivo actual="artistas" cantidades={cantidades} />
      <BarraDeFiltros q={q ?? ""} decada="" orden="" decadas={[]} ordenes={[]} ruta="/archivo/artistas" placeholder="Buscá un artista…" parametros={sinVacios({ letra })} />
      <nav aria-label="Por letra">
        <ul className="chips">
          <li><Link href="/archivo/artistas" className="chip" aria-current={!letra ? "true" : undefined}>Todos</Link></li>
          {LETRAS.map((l) => (
            <li key={l}>
              <Link href={`/archivo/artistas?letra=${l}`} className="chip chip--letra" aria-current={letra === l ? "true" : undefined}>{l}</Link>
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
          <p className="resultados__cuenta">{`${cantidad(artistas.count)} ${artistas.count === 1 ? "artista encontrado" : "artistas encontrados"}`}</p>
          <ul className="grilla" aria-label="Artistas">
            {artistas.results.map((a, lugar) => <TarjetaDeArtista key={a.id} artista={a} lugar={lugar} />)}
          </ul>
          <PaginasNumeradas pagina={artistas.page} paginas={artistas.pages} ruta="/archivo/artistas" parametros={sinVacios({ q, letra })} />
        </>
      )}
    </Marco>
  );
}
