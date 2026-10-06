import type { Metadata } from "next";
import Link from "next/link";
import { filtrosDelArchivo, listarArtistas, listarCanciones, listarDiscos, type OrdenDeCanciones } from "../lib/archivo-musical";
import { NOMBRE } from "../lib/seo";
import { BarraDeFiltros } from "./BarraDeFiltros";
import { ChipsDeGenero } from "./ChipsDeGenero";
import { elegirChips } from "./generos";
import { ColageDelArchivo } from "./ColageDelArchivo";
import { FilaDeCancion } from "./Listados";
import { Aviso, Marco } from "./Marco";
import { PaginasNumeradas } from "./PaginasNumeradas";
import { PestanasDelArchivo } from "./PestanasDelArchivo";
import { TarjetaDeCancion } from "./TarjetaDeCancion";
import { cantidad, enteroDe, sinVacios, textoDe, type Parametros } from "./utiles";
import "./archivo-explorador.css";

// El catálogo cambia solo cuando se importa: el explorador se arma como mucho cada diez minutos por cada combinación de filtros.
export const revalidate = 600;

const TITULO = "Archivo de música";
const DESCRIPCION = "Buscá y explorá los artistas, discos y canciones uruguayos de Banda Oriental: por nombre, por época o por género.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/archivo" },
  // Next combina la metadata de forma superficial: se repite lo que el sitio ya decía (nombre, idioma).
  openGraph: { title: TITULO, description: DESCRIPCION, siteName: NOMBRE, locale: "es_UY", url: "/archivo" },
  twitter: { title: TITULO, description: DESCRIPCION },
};

const POR_PAGINA = 15; // cinco por fila, tres filas
const GENEROS_EN_LOS_CHIPS = 8; // más "Otros", que lleva al selector con todos
const ORDENES: OrdenDeCanciones[] = ["title", "artist", "newest", "oldest"];

export default async function ExploradorDelArchivo({ searchParams }: { searchParams: Parametros }) {
  const consulta = await searchParams;
  const q = textoDe(consulta.q);
  const decada = enteroDe(consulta.decada);
  const genero = textoDe(consulta.genero, 60);
  const orden = ORDENES.find((o) => o === consulta.orden);
  const numero = enteroDe(consulta.pagina) ?? 1;
  const lista = consulta.vista === "lista";

  const [canciones, todas, artistas, discos, filtros] = await Promise.all([
    listarCanciones({ q, decada, genero, orden, pagina: numero, porPagina: POR_PAGINA }),
    listarCanciones({ porPagina: 1 }),
    listarArtistas({ porPagina: 1 }),
    listarDiscos({ porPagina: 1 }),
    filtrosDelArchivo(),
  ]);

  const generos = elegirChips((filtros?.genres ?? []).map((g) => g.genre), GENEROS_EN_LOS_CHIPS);
  const filtrosPuestos = sinVacios({ q, decada, genero, orden: orden && orden !== "title" ? orden : undefined });
  const conVista = (vista: "lista" | undefined) => {
    const busqueda = new URLSearchParams({ ...filtrosPuestos, ...(vista && { vista }) });
    return busqueda.size ? `/archivo?${busqueda}` : "/archivo";
  };

  return (
    <Marco ancho pie="completo">
      <section className="hero-archivo">
        <div className="hero-archivo__texto">
          <p className="hero-archivo__etiqueta">Archivo de música uruguaya</p>
          <h1>
            Explorá el <span className="hero-archivo__resaltado">archivo.</span>
          </h1>
          <p className="hero-archivo__bajada">
            {todas && todas.count >= 100 ? `Más de ${cantidad(Math.floor(todas.count / 100) * 100)} canciones, discos y artistas` : "Canciones, discos y artistas uruguayos"} de todas las épocas. Buscá, filtrá y descubrí.
          </p>
          <PestanasDelArchivo actual="canciones" cantidades={{ canciones: todas?.count ?? null, artistas: artistas?.count ?? null, discos: discos?.count ?? null }} />
        </div>
        <ColageDelArchivo />
      </section>

      <BarraDeFiltros
        q={q ?? ""}
        decada={decada ? String(decada) : ""}
        orden={orden ?? "title"}
        decadas={(filtros?.decades ?? []).map((d) => d.decade)}
        genero={genero ?? ""}
        generos={(filtros?.genres ?? []).map((g) => g.genre)}
        parametros={sinVacios({ vista: lista ? "lista" : undefined })}
      />
      <ChipsDeGenero conOtros generos={generos} actual={genero} parametros={sinVacios({ q, decada, orden: orden && orden !== "title" ? orden : undefined, vista: lista ? "lista" : undefined })} />

      {canciones === null ? (
        <Aviso>No pudimos cargar las canciones ahora. Probá de nuevo en un rato.</Aviso>
      ) : (
        <>
          <div className="resultados__cabecera">
            <p className="resultados__cuenta">{`${cantidad(canciones.count)} ${canciones.count === 1 ? "canción encontrada" : "canciones encontradas"}`}</p>
            <div className="vistas" role="group" aria-label="Vista">
              <Link href={conVista(undefined)} className="vistas__boton" aria-label="Ver como tarjetas" aria-current={!lista ? "true" : undefined}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </Link>
              <Link href={conVista("lista")} className="vistas__boton" aria-label="Ver como lista" aria-current={lista ? "true" : undefined}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Link>
            </div>
          </div>

          {canciones.results.length === 0 ? (
            <div className="archivo-aviso">
              <p>No encontramos canciones con ese criterio.</p>
              <Link href="/archivo">Ver todas las canciones</Link>
            </div>
          ) : lista ? (
            <ul className="archivo-lista" aria-label="Canciones">
              {canciones.results.map((c) => <FilaDeCancion key={c.id} cancion={c} />)}
            </ul>
          ) : (
            <ul className="grilla" aria-label="Canciones">
              {canciones.results.map((c) => <TarjetaDeCancion key={c.id} cancion={c} />)}
            </ul>
          )}
          <PaginasNumeradas pagina={canciones.page} paginas={canciones.pages} ruta="/archivo" parametros={sinVacios({ ...filtrosPuestos, vista: lista ? "lista" : undefined })} />
        </>
      )}
    </Marco>
  );
}
