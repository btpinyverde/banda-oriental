"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { buscarEnElArchivo, rutaDeArtista, rutaDeDisco, type Busqueda } from "../lib/archivo-musical";
import { FilaDeCancion } from "./Listados";
import "./archivo-musical.css";

const ESPERA_MS = 250;
const MINIMO = 2;
const POR_GRUPO = 5;

type Estado = { tipo: "quieto" } | { tipo: "buscando" } | { tipo: "error" } | { tipo: "listo"; busqueda: Busqueda };

const hacia = (ruta: string, q: string) => `${ruta}?${new URLSearchParams({ q })}`;

/**
 * El buscador del archivo: artistas, discos y canciones a medida que se escribe. También anda sin JavaScript (es un
 * formulario que lleva a la lista de canciones). La respuesta de una búsqueda vieja no pisa a la nueva.
 */
export function BuscadorDelArchivo() {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "quieto" });
  const [intento, setIntento] = useState(0);
  const ayuda = useId();
  const cancelar = useRef<AbortController | null>(null);

  const q = texto.trim().replace(/\s+/g, " ");

  useEffect(() => {
    cancelar.current?.abort();
    if (q.length < MINIMO) {
      setEstado({ tipo: "quieto" });
      return;
    }
    const controlador = new AbortController();
    cancelar.current = controlador;
    const temporizador = window.setTimeout(() => {
      setEstado({ tipo: "buscando" });
      buscarEnElArchivo(q, { limite: POR_GRUPO, senial: controlador.signal })
        .then((busqueda) => !controlador.signal.aborted && setEstado({ tipo: "listo", busqueda }))
        .catch((error) => {
          if (controlador.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
          setEstado({ tipo: "error" });
        });
    }, ESPERA_MS);
    return () => {
      window.clearTimeout(temporizador);
      controlador.abort();
    };
  }, [q, intento]);

  const busqueda = estado.tipo === "listo" ? estado.busqueda : null;
  const total = busqueda ? busqueda.artists.total + busqueda.albums.total + busqueda.songs.total : 0;

  return (
    <div className="archivo-buscador">
      <form action="/archivo/canciones" method="get" role="search" onSubmit={(e) => q.length < MINIMO && e.preventDefault()}>
        <label className="solo-lectores" htmlFor={`${ayuda}-campo`}>
          Buscar en el archivo
        </label>
        <input
          id={`${ayuda}-campo`}
          type="search"
          name="q"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Una canción, un artista o un disco…"
          autoComplete="off"
          aria-describedby={ayuda}
          maxLength={100}
        />
        <button type="submit" className="boton boton--violeta">
          Buscar
        </button>
      </form>
      <p id={ayuda} className="archivo-buscador__ayuda">
        {texto.length > 0 && q.length < MINIMO ? "Escribí al menos 2 letras." : "Se busca por título, artista o disco, en cualquier orden y sin importar las tildes."}
      </p>

      <div role="status" className={estado.tipo === "listo" || estado.tipo === "buscando" ? "archivo-buscador__estado" : "solo-lectores"}>
        {estado.tipo === "buscando" && "Buscando…"}
        {busqueda && (total === 0 ? "" : `${total} ${total === 1 ? "resultado" : "resultados"}`)}
      </div>

      {estado.tipo === "error" && (
        <div role="alert" className="archivo-aviso">
          <p>No pudimos buscar ahora.</p>
          <button type="button" className="boton boton--claro" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {busqueda && total === 0 && <p className="archivo-aviso">{`No encontramos nada para «${q}». Probá con menos palabras.`}</p>}

      {busqueda && busqueda.artists.results.length > 0 && (
        <section aria-labelledby={`${ayuda}-artistas`} role="region" aria-label="Artistas" className="archivo-grupo">
          <h2 id={`${ayuda}-artistas`}>Artistas</h2>
          <ul>
            {busqueda.artists.results.map((a) => (
              <li key={a.id} className="archivo-fila">
                <Link href={rutaDeArtista(a)} className="archivo-fila__titulo">
                  {a.name}
                </Link>
                <span className="archivo-fila__datos">{`${a.albums} ${a.albums === 1 ? "disco" : "discos"} · ${a.songs} ${a.songs === 1 ? "canción" : "canciones"}`}</span>
              </li>
            ))}
          </ul>
          {busqueda.artists.total > busqueda.artists.results.length && <Link href={hacia("/archivo/artistas", q)}>{`Ver los ${busqueda.artists.total} artistas`}</Link>}
        </section>
      )}

      {busqueda && busqueda.albums.results.length > 0 && (
        <section role="region" aria-label="Discos" className="archivo-grupo">
          <h2>Discos</h2>
          <ul>
            {busqueda.albums.results.map((d) => (
              <li key={d.id} className="archivo-fila">
                <Link href={rutaDeDisco(d)} className="archivo-fila__titulo">
                  {d.name}
                </Link>
                <span className="archivo-fila__datos">{[d.artist.name, d.year].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
          {busqueda.albums.total > busqueda.albums.results.length && <Link href={hacia("/archivo/discos", q)}>{`Ver los ${busqueda.albums.total} discos`}</Link>}
        </section>
      )}

      {busqueda && busqueda.songs.results.length > 0 && (
        <section role="region" aria-label="Canciones" className="archivo-grupo">
          <h2>Canciones</h2>
          <ul>
            {busqueda.songs.results.map((c) => (
              <FilaDeCancion key={c.id} cancion={c} />
            ))}
          </ul>
          {busqueda.songs.total > busqueda.songs.results.length && <Link href={hacia("/archivo/canciones", q)}>{`Ver las ${busqueda.songs.total} canciones`}</Link>}
        </section>
      )}
    </div>
  );
}
