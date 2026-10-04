import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import type { GrupoDeDiscos } from "../lib/catalogo";
import { Explorador } from "./Explorador";
import "./explorar.css";

interface Props {
  actual: "/artistas" | "/epocas" | "/generos";
  titulo: string;
  bajada: string;
  /** `null` cuando no se pudo consultar la API: se avisa en vez de mostrar una lista vacía. */
  grupos: GrupoDeDiscos[] | null;
  conArtista?: boolean;
  buscable?: boolean;
}

/** Marco común de las páginas para explorar el catálogo: título, barra del sitio y la lista de grupos. */
export function PaginaExplorar({ actual, titulo, bajada, grupos, conArtista, buscable }: Props) {
  return (
    <>
      <Navbar actual={actual} />
      <main className="explorar">
        <header className="explorar__cabecera">
          <h1>{titulo}</h1>
          <p>{bajada}</p>
        </header>
        {grupos === null ? (
          <div className="explorar__aviso" role="alert">
            <p>No pudimos cargar el catálogo ahora. Probá de nuevo en un rato.</p>
          </div>
        ) : (
          <Explorador grupos={grupos} conArtista={conArtista} buscable={buscable} />
        )}
      </main>
      <Footer variante="compacto" />
    </>
  );
}
