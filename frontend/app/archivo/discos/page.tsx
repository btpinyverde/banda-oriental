import type { Metadata } from "next";
import { filtrosDelArchivo, listarDiscos } from "../../lib/archivo-musical";
import { FilaDeDisco, Paginacion } from "../Listados";
import { Aviso, Marco } from "../Marco";
import { cantidad, enteroDe, sinVacios, textoDe, type Parametros } from "../utiles";

export const metadata: Metadata = {
  title: "Discos",
  description: "Los discos uruguayos del archivo de Banda Oriental, para explorar por época y por género.",
  alternates: { canonical: "/archivo/discos" },
};

export default async function PaginaDeDiscos({ searchParams }: { searchParams: Parametros }) {
  const consulta = await searchParams;
  const q = textoDe(consulta.q);
  const decada = enteroDe(consulta.decada);
  const genero = textoDe(consulta.genero, 60);
  const orden = consulta.orden === "year" || consulta.orden === "name" ? consulta.orden : undefined;
  const numero = enteroDe(consulta.pagina) ?? 1;
  const [filtros, discos] = await Promise.all([filtrosDelArchivo(), listarDiscos({ q, decada, genero, orden, pagina: numero })]);
  const generos = filtros?.genres.map((g) => g.genre) ?? [];
  if (genero && !generos.includes(genero)) generos.push(genero);
  return (
    <Marco>
      <h1>Discos</h1>
      <form method="get" action="/archivo/discos" role="search" className="archivo-filtros">
        <label>
          Buscar un disco
          <input type="search" name="q" defaultValue={q ?? ""} maxLength={100} />
        </label>
        <label>
          Década
          <select name="decada" defaultValue={decada ? String(decada) : ""}>
            <option value="">Todas</option>
            {(filtros?.decades ?? []).map(({ decade }) => <option key={decade} value={decade}>{decade}</option>)}
          </select>
        </label>
        <label>
          Género
          <select name="genero" defaultValue={genero ?? ""}>
            <option value="">Todos</option>
            {generos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>
          Orden
          <select name="orden" defaultValue={orden ?? "name"}>
            <option value="name">Por nombre</option>
            <option value="year">Por año</option>
          </select>
        </label>
        <button type="submit" className="boton boton--violeta">Filtrar</button>
      </form>
      {discos === null ? (
        <Aviso>No pudimos cargar los discos ahora. Probá de nuevo en un rato.</Aviso>
      ) : discos.results.length === 0 ? (
        <p className="archivo-aviso">No encontramos discos con ese criterio.</p>
      ) : (
        <>
          <p className="archivo-musical__bajada">{`${cantidad(discos.count)} ${discos.count === 1 ? "disco" : "discos"}`}</p>
          <ul className="archivo-lista">
            {discos.results.map((d) => <FilaDeDisco key={d.id} disco={d} />)}
          </ul>
          <Paginacion pagina={discos.page} paginas={discos.pages} ruta="/archivo/discos" parametros={sinVacios({ q, decada, genero, orden })} />
        </>
      )}
    </Marco>
  );
}
