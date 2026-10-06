import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { artistasDestacados, fichaDeArtista, filtrosDelArchivo, listarDiscos } from "../../lib/archivo-musical";
import { BarraDeFiltros } from "../BarraDeFiltros";
import { CabeceraDeArtista } from "../CabeceraDeArtista";
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
  if (artista) return paginaDeUnArtista(artista, numero);
  const [filtros, discos, cantidades] = await Promise.all([
    filtrosDelArchivo(),
    listarDiscos({ q, decada, genero, orden, pagina: numero, porPagina: POR_PAGINA }),
    cantidadesDelArchivo(),
  ]);
  const generos = filtros?.genres.map((g) => g.genre) ?? [];
  const filtrosPuestos = sinVacios({ q, decada, genero, orden: orden && orden !== "name" ? orden : undefined });
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
        parametros={{}}
      />
      <ChipsDeGenero
        conOtros
        ruta="/archivo/discos"
        generos={elegirChips(generos, GENEROS_EN_LOS_CHIPS)}
        actual={genero}
        parametros={sinVacios({ q, decada, orden: orden && orden !== "name" ? orden : undefined })}
      />
      {discos === null ? (
        <Aviso>No pudimos cargar los discos ahora. Probá de nuevo en un rato.</Aviso>
      ) : discos.results.length === 0 ? (
        <p className="archivo-aviso">No encontramos discos con ese criterio.</p>
      ) : (
        <>
          <p className="resultados__cuenta">{`${cantidad(discos.count)} ${discos.count === 1 ? "disco encontrado" : "discos encontrados"}`}</p>
          <ul className="grilla" aria-label="Discos">
            {discos.results.map((d, lugar) => <TarjetaDeDisco key={d.id} disco={d} lugar={lugar} />)}
          </ul>
          <PaginasNumeradas pagina={discos.page} paginas={discos.pages} ruta="/archivo/discos" parametros={filtrosPuestos} />
        </>
      )}
    </Marco>
  );
}

/** La página de un artista: su cabecera y sus discos. Si la ficha no responde se sigue con el nombre que traen sus discos. */
async function paginaDeUnArtista(id: number, numero: number) {
  const [ficha, discos, destacados] = await Promise.all([
    fichaDeArtista(id),
    listarDiscos({ artista: id, pagina: numero, porPagina: POR_PAGINA }),
    artistasDestacados(),
  ]);
  if (ficha === "no-encontrado") notFound();
  const nombre = ficha?.name ?? discos?.results[0]?.artist.name ?? "Artista";
  const anios = ficha?.first_year && ficha.last_year ? (ficha.first_year === ficha.last_year ? String(ficha.first_year) : `${ficha.first_year}–${ficha.last_year}`) : "";
  return (
    <Marco ancho pie="completo">
      <CabeceraDeArtista
        id={id}
        nombre={nombre}
        discos={discos?.count ?? 0}
        canciones={ficha?.songs ?? null}
        anios={anios}
        foto={ficha?.picture_url || undefined}
        recorte={destacados?.find((a) => a.id === id)?.photo_url || undefined}
      />
      {discos === null ? (
        <Aviso>No pudimos cargar los discos ahora. Probá de nuevo en un rato.</Aviso>
      ) : discos.results.length === 0 ? (
        <p className="archivo-aviso">Este artista todavía no tiene discos en el archivo.</p>
      ) : (
        <>
          <h2 className="archivo-seccion">Discos</h2>
          <ul className="grilla" aria-label="Discos">
            {discos.results.map((d, lugar) => <TarjetaDeDisco key={d.id} disco={d} lugar={lugar} />)}
          </ul>
          <PaginasNumeradas pagina={discos.page} paginas={discos.pages} ruta="/archivo/discos" parametros={{ artista: String(id) }} />
        </>
      )}
    </Marco>
  );
}
