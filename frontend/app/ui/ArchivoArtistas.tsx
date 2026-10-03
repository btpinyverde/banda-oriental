"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export type ArtistaArchivo = {
  id: string;
  nombre: string;
  canciones: number;
  generos: string[];
  /** URL de la tapa. Si falta, la card muestra un bloque neutro: no se inventa ninguna imagen. */
  tapa?: string;
};

type Props = {
  artistas: ArtistaArchivo[];
  /** Géneros para los chips, en el orden en que se muestran (después de "Todos"). */
  generos: string[];
  totalCanciones: number;
};

const COLA_DE_LA_BAJADA = "de todas las épocas, géneros y rincones del Uruguay.";

/** Bajada de la sección, con el total de canciones del catálogo. */
export function textoCatalogo(canciones: number): string {
  if (canciones >= 100) return `Más de ${Math.floor(canciones / 100) * 100} canciones ${COLA_DE_LA_BAJADA}`;
  if (canciones > 0) return `${canciones} ${canciones === 1 ? "canción" : "canciones"} ${COLA_DE_LA_BAJADA}`;
  return "Canciones uruguayas de todas las épocas, géneros y rincones del país.";
}

const cancionesDe = (n: number) => `${n} ${n === 1 ? "canción" : "canciones"}`;

/** Vitrina del catálogo: un carrusel de artistas filtrable por género. */
export function ArchivoArtistas({ artistas, generos, totalCanciones }: Props) {
  const [genero, setGenero] = useState<string | null>(null);
  const fila = useRef<HTMLUListElement>(null);

  const visibles = genero ? artistas.filter((a) => a.generos.includes(genero)) : artistas;

  const mover = (sentido: -1 | 1) => {
    const lista = fila.current;
    const reducirMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lista?.scrollBy?.({ left: sentido * lista.clientWidth * 0.8, behavior: reducirMovimiento ? "auto" : "smooth" });
  };

  return (
    <section className="archivo" aria-labelledby="archivo-titulo">
      <div className="archivo__cabecera">
        <div>
          <h2 className="archivo__titulo" id="archivo-titulo">
            Explorá el archivo
          </h2>
          <p className="archivo__bajada">{textoCatalogo(totalCanciones)}</p>
        </div>
        <Link href="/archivo" className="boton boton--contorno">
          Ver todo el archivo
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 24h33M28 11l13 13-13 13" />
          </svg>
        </Link>
      </div>

      {visibles.length === 0 ? (
        <p className="archivo__vacio">
          {genero ? "Todavía no hay artistas de este género." : "Todavía no hay artistas en el archivo."}
        </p>
      ) : (
        <div className="archivo__carrusel">
          <button type="button" className="archivo__flecha archivo__flecha--anterior" aria-label="Anterior" onClick={() => mover(-1)}>
            <img src="/assets/arrow-right.svg" alt="" width={20} height={20} />
          </button>
          <ul className="archivo__fila" ref={fila}>
            {visibles.map((artista) => (
              <li key={artista.id} className="artista">
                <div className="artista__foto">
                  {artista.tapa && (
                    <img src={artista.tapa} alt={`Tapa de un disco de ${artista.nombre}`} loading="lazy" />
                  )}
                </div>
                <p className="artista__nombre">{artista.nombre}</p>
                <p className="artista__canciones">{cancionesDe(artista.canciones)}</p>
              </li>
            ))}
          </ul>
          <button type="button" className="archivo__flecha archivo__flecha--siguiente" aria-label="Siguiente" onClick={() => mover(1)}>
            <img src="/assets/arrow-right.svg" alt="" width={20} height={20} />
          </button>
        </div>
      )}

      {generos.length > 0 && (
        <ul className="archivo__generos" aria-label="Filtrar por género">
          {[null, ...generos].map((nombre) => (
            <li key={nombre ?? "todos"}>
              <button type="button" className="genero" aria-pressed={genero === nombre} onClick={() => setGenero(nombre)}>
                {nombre ?? "Todos"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
