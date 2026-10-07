"use client";

import { useState } from "react";
import type { ItemDeLista, LecturaDeYoutube } from "../lib/batallas/api-batallas";
import type { BuscarCanciones, CancionCatalogo } from "../lib/juego/tipos";
import { BuscadorCanciones } from "../jugar/BuscadorCanciones";
import type { ApiYoutube } from "../lib/batallas/youtube-iframe";
import { ReproductorYoutube } from "./ReproductorYoutube";

/** Un elemento de la lista con lo necesario para mostrarlo (el servidor solo recibe `ItemDeLista`). */
export type ItemConDatos = ItemDeLista & { titulo: string; artista: string };

interface Props {
  items: ItemConDatos[];
  alCambiar: (items: ItemConDatos[]) => void;
  /** El catálogo con el que se busca la canción. */
  /** Busca canciones en el servidor, de a páginas. */
  buscar: BuscarCanciones;
  leerYoutube: (url: string) => Promise<LecturaDeYoutube>;
  maximo: number;
  /** Para los tests: cómo se carga el reproductor de YouTube con el que se prueba el video. */
  cargarVideo?: () => Promise<ApiYoutube>;
}

const minutos = (segundos: number) => `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

/**
 * La lista de canciones que arma quien organiza, en el orden en que van a salir. Cada una se oye con el preview de Deezer o,
 * si se pega un enlace, con el video de YouTube (la respuesta siempre es una canción del catálogo).
 */
export function ListaElegida({ items, alCambiar, buscar, leerYoutube, maximo, cargarVideo }: Props) {
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [enlace, setEnlace] = useState("");
  const [lectura, setLectura] = useState<LecturaDeYoutube | null>(null);
  const [inicio, setInicio] = useState("0");
  const [leyendo, setLeyendo] = useState(false);
  // El video leído no se puede reproducir en el sitio (el dueño no deja embeberlo, aunque YouTube lo muestre normal).
  const [videoBloqueado, setVideoBloqueado] = useState(false);
  const [errorYoutube, setErrorYoutube] = useState<string | null>(null);
  const lleno = items.length >= maximo;

  /** Suma una canción a la lista; devuelve el motivo si no se pudo. */
  function agregar(cancion: CancionCatalogo, origen: Pick<ItemDeLista, "source" | "youtube_id" | "start_seconds">): string | null {
    if (items.length >= maximo) return `Llegaste al máximo de ${maximo} canciones.`;
    if (items.some((i) => i.song_id === cancion.id)) return "Esa canción ya está en la lista.";
    alCambiar([...items, { song_id: cancion.id, ...origen, titulo: cancion.title, artista: cancion.artist }]);
    return null;
  }

  function mover(posicion: number, hacia: -1 | 1) {
    const copia = [...items];
    [copia[posicion], copia[posicion + hacia]] = [copia[posicion + hacia], copia[posicion]];
    alCambiar(copia);
  }

  async function leer() {
    if (enlace.trim() === "") return;
    setErrorYoutube(null);
    setVideoBloqueado(false);
    setLeyendo(true);
    try {
      setLectura(await leerYoutube(enlace.trim()));
    } catch (e) {
      setLectura(null);
      setErrorYoutube(e instanceof Error ? e.message : "No pudimos leer ese enlace. Probá de nuevo.");
    } finally {
      setLeyendo(false);
    }
  }

  function usarParaYoutube(cancion: CancionCatalogo) {
    if (!lectura) return;
    const segundo = Number(inicio);
    // Un video que no se puede reproducir acá no sirve: la canción queda con su preview de Deezer.
    const motivo = agregar(
      cancion,
      videoBloqueado
        ? { source: "deezer" }
        : { source: "youtube", youtube_id: lectura.youtube_id, start_seconds: Number.isInteger(segundo) && segundo >= 0 && segundo <= 600 ? segundo : 0 },
    );
    setErrorYoutube(motivo);
    if (!motivo) {
      setLectura(null);
      setEnlace("");
      setInicio("0");
    }
  }

  return (
    <div className="batalla__lista">
      <section aria-label="Agregar del catálogo" className="batalla__campo">
        <span>Agregar del catálogo (suena con el preview de Deezer)</span>
        <BuscadorCanciones
          buscar={buscar}
          puedeEnviar={!lleno}
          etiquetaDeEnviar="Agregar a la lista"
          alEnviar={(c) => setErrorCatalogo(agregar(c, { source: "deezer" }))}
        />
        {errorCatalogo && (
          <p className="batalla__error" role="alert">
            {errorCatalogo}
          </p>
        )}
      </section>

      <section aria-label="Agregar un enlace de YouTube" className="batalla__campo">
        <span>Agregar un enlace de YouTube (suena el video desde el segundo que elijas)</span>
        <div className="batalla__enlace">
          <input aria-label="Enlace de YouTube" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://youtu.be/…" />
          <button type="button" className="boton boton--violeta-claro" onClick={leer} disabled={leyendo}>
            {leyendo ? "Leyendo…" : "Leer enlace"}
          </button>
        </div>
        {lectura && (
          <div className="batalla__campo">
            <p className="batalla__nota">
              Video: {lectura.title} ({lectura.author})
            </p>
            <ReproductorYoutube key={lectura.youtube_id} videoId={lectura.youtube_id} inicio={0} activo={false} alFallar={() => setVideoBloqueado(true)} cargar={cargarVideo} />
            {videoBloqueado && (
              <p className="batalla__error">
                Este video no se puede reproducir en el sitio (el dueño no deja verlo en otras páginas). Si elegís la canción, va a sonar con el
                preview de Deezer.
              </p>
            )}
            <label className="batalla__campo">
              Empezar en el segundo
              <input inputMode="numeric" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </label>
            <p className="batalla__nota">Elegí qué canción es:</p>
            {lectura.suggestions.map((c) => (
              <button key={c.id} type="button" className="boton boton--violeta-claro" aria-label={`Es ${c.title} de ${c.artist}`} onClick={() => usarParaYoutube(c)}>
                Es «{c.title}» de {c.artist}
              </button>
            ))}
            <BuscadorCanciones buscar={buscar} puedeEnviar={!lleno} etiquetaDeEnviar="Usar esta canción" alEnviar={usarParaYoutube} />
          </div>
        )}
        {errorYoutube && (
          <p className="batalla__error" role="alert">
            {errorYoutube}
          </p>
        )}
      </section>

      <p className="batalla__nota" aria-live="polite">
        {items.length === 1 ? "1 canción en la lista" : `${items.length} canciones en la lista`}
        {lleno && ` · Llegaste al máximo de ${maximo} canciones.`}
      </p>
      <ol className="batalla__orden">
        {items.map((item, i) => (
          <li key={item.song_id}>
            <span>
              {i + 1}. {item.titulo} — {item.artista}{" "}
              <em>{item.source === "youtube" ? `YouTube desde ${minutos(item.start_seconds ?? 0)}` : "Preview de Deezer"}</em>
            </span>
            <button type="button" className="batalla__mini" aria-label={`Subir ${item.titulo}`} disabled={i === 0} onClick={() => mover(i, -1)}>
              ↑
            </button>
            <button type="button" className="batalla__mini" aria-label={`Bajar ${item.titulo}`} disabled={i === items.length - 1} onClick={() => mover(i, 1)}>
              ↓
            </button>
            <button type="button" className="batalla__mini batalla__mini--no" aria-label={`Quitar ${item.titulo}`} onClick={() => alCambiar(items.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
