import type { Metadata } from "next";
import Link from "next/link";
import { filtrosDelArchivo, listarDiscos } from "../../lib/archivo-musical";
import { BarraDeFiltros } from "../BarraDeFiltros";
import { cantidadesDelArchivo } from "../cantidades";
import { ChipsDeGenero } from "../ChipsDeGenero";
import { EncabezadoDelArchivo } from "../EncabezadoDelArchivo";
import { elegirChips } from "../generos";
import { Aviso, Marco } from "../Marco";
import { PaginasNumeradas } from "../PaginasNumeradas";
import { TarjetaDeDisco } from "../TarjetasDelArchivo";
import { cantidad, enteroDe, sinVacios, textoDe, type Parametros } from "../utiles";
import "../archivo-explorador.css";

export const metadata: Metadata = {
  title: "Discos",
  description: "Los discos uruguayos del archivo de Banda Oriental, para explorar por época y por género.",
  alternates: { canonical: "/archivo/discos" },
};

const POR_PAGINA = 15; // cinco por fila, tres filas
const GENEROS_EN_LOS_CHIPS = 8; // más "Otros", que lleva al selector con todos
const ORDENES = [
  { valor: "name", etiqueta: "Ordenar por" }, // lo de siempre: por nombre, de la A a la Z
  { valor: "year", etiqueta: "Por año" },
];

export default async function PaginaDeDiscos({ searchParams }: { searchParams: Parametros }) {
  const consulta = await searchParams;
  const q = textoDe(consulta.q);
  const decada = enteroDe(consulta.decada);
  const genero = textoDe(consulta.genero, 60);
  const artista = enteroDe(consulta.artista);
  const orden = consulta.orden === "year" || consulta.orden === "name" ? consulta.orden : undefined;
  const numero = enteroDe(consulta.pagina) ?? 1;
  const [filtros, discos, cantidades] = await Promise.all([
    filtrosDelArchivo(),
    listarDiscos({ q, decada, genero, artista, orden, pagina: numero, porPagina: POR_PAGINA }),
    cantidadesDelArchivo(),
  ]);
  const generos = filtros?.genres.map((g) => g.genre) ?? [];
  const filtrosPuestos = sinVacios({ q, decada, genero, artista, orden: orden && orden !== "name" ? orden : undefined });
  return (
    <Marco ancho pie="completo">
      <EncabezadoDelArchivo actual="discos" cantidades={cantidades} />
      <BarraDeFiltros
        q={q ?? ""}
        decada={decada ? String(decada) : ""}
        orden={orden ?? "name"}
        decadas={(filtros?.decades ?? []).map((d) => d.decade)}
        genero={genero ?? ""}
        generos={generos}
        ruta="/archivo/discos"
        placeholder="Buscá un disco…"
        ordenes={ORDENES}
        ordenPorDefecto="name"
        parametros={sinVacios({ artista })}
      />
      <ChipsDeGenero
        conOtros
        ruta="/archivo/discos"
        generos={elegirChips(generos, GENEROS_EN_LOS_CHIPS)}
        actual={genero}
        parametros={sinVacios({ q, decada, artista, orden: orden && orden !== "name" ? orden : undefined })}
      />
      {discos === null ? (
        <Aviso>No pudimos cargar los discos ahora. Probá de nuevo en un rato.</Aviso>
      ) : discos.results.length === 0 ? (
        <p className="archivo-aviso">No encontramos discos con ese criterio.</p>
      ) : (
        <>
          {artista ? (
            <p className="resultados__cuenta">
              <span>{`${cantidad(discos.count)} ${discos.count === 1 ? "disco" : "discos"} de ${discos.results[0].artist.name}`}</span> ·{" "}
              <Link href="/archivo/discos">Ver todos los discos</Link>
            </p>
          ) : (
            <p className="resultados__cuenta">{`${cantidad(discos.count)} ${discos.count === 1 ? "disco encontrado" : "discos encontrados"}`}</p>
          )}
          <ul className="grilla" aria-label="Discos">
            {discos.results.map((d, lugar) => <TarjetaDeDisco key={d.id} disco={d} lugar={lugar} />)}
          </ul>
          <PaginasNumeradas pagina={discos.page} paginas={discos.pages} ruta="/archivo/discos" parametros={filtrosPuestos} />
        </>
      )}
    </Marco>
  );
}
