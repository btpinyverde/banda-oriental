"use client";

import Link from "next/link";
import { useRef } from "react";
import { Ondulada } from "./Ondulada";

export type ArtistaArchivo = {
  id: number | string;
  nombre: string;
  canciones: number;
  /** La ficha del artista en el archivo. */
  href: string;
  /** Los años de sus discos ("1996–2004"), si se sabe. */
  anios?: string;
};

type Props = {
  artistas: ArtistaArchivo[];
  /** Géneros para los chips, en el orden en que se muestran (después de "Todos"). Cada uno lleva a los discos de ese género. */
  generos: string[];
  totalCanciones: number;
};

const COLA_DE_LA_BAJADA = "de todas las épocas, géneros y rincones del Uruguay.";

/** Bajada de la sección, con el total de canciones del catálogo. */
export function textoCatalogo(canciones: number): string {
  if (canciones >= 100) return `Más de ${new Intl.NumberFormat("es-UY").format(Math.floor(canciones / 100) * 100)} canciones ${COLA_DE_LA_BAJADA}`;
  if (canciones > 0) return `${canciones} ${canciones === 1 ? "canción" : "canciones"} ${COLA_DE_LA_BAJADA}`;
  return "Canciones uruguayas de todas las épocas, géneros y rincones del país.";
}

const TONOS = 5;
/** La letra o el número con que empieza el nombre ("#TocoParaVos" → "T"), para el bloque de color que reemplaza a la foto. */
export function inicialDe(nombre: string): string {
  const letra = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[\p{L}\p{N}]/u);
  return (letra ? nombre.normalize("NFC").match(/[\p{L}\p{N}]/u)![0] : "·").toLocaleUpperCase("es");
}
/** Un color de la marca por artista, siempre el mismo (sale del nombre, no del orden en que aparece). */
const tonoDe = (nombre: string) => [...nombre].reduce((suma, c) => suma + c.charCodeAt(0), 0) % TONOS;

const cancionesDe = (n: number) => `${n} ${n === 1 ? "canción" : "canciones"}`;

/** Vitrina del archivo: un carrusel de artistas del catálogo y atajos a los géneros. */
export function ArchivoArtistas({ artistas, generos, totalCanciones }: Props) {
  const fila = useRef<HTMLUListElement>(null);

  const mover = (sentido: -1 | 1) => {
    const lista = fila.current;
    const reducirMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    lista?.scrollBy?.({ left: sentido * lista.clientWidth * 0.8, behavior: reducirMovimiento ? "auto" : "smooth" });
  };

  return (
    <section className="archivo" aria-labelledby="archivo-titulo">
      {/* La línea ondulada abre la sección solo en celular (en desktop la separan los espacios). */}
      <Ondulada className="archivo__ondulada" trazo="corta" />
      <div className="archivo__cabecera">
        <div>
          <h2 className="archivo__titulo" id="archivo-titulo">
            Explorá el archivo
          </h2>
          <p className="archivo__bajada">{textoCatalogo(totalCanciones)}</p>
        </div>
        <Link href="/archivo/artistas" className="boton boton--contorno">
          Ver todos los artistas
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 24h33M28 11l13 13-13 13" />
          </svg>
        </Link>
      </div>

      {artistas.length === 0 ? (
        <p className="archivo__vacio">Todavía no hay artistas en el archivo.</p>
      ) : (
        <div className="archivo__carrusel">
          <button type="button" className="archivo__flecha archivo__flecha--anterior" aria-label="Anterior" onClick={() => mover(-1)}>
            <img src="/assets/arrow-right.svg" alt="" width={20} height={20} />
          </button>
          <ul className="archivo__fila" ref={fila}>
            {artistas.map((artista) => (
              <li key={artista.id} className="artista">
                <Link href={artista.href} className="artista__enlace">
                  {/* No hay fotos de las bandas: un bloque de color con la inicial, sin inventar ninguna imagen. */}
                  <div className={`artista__foto artista__foto--tono-${tonoDe(artista.nombre)}`}>
                    <span className="artista__inicial" aria-hidden="true">
                      {inicialDe(artista.nombre)}
                    </span>
                  </div>
                  <p className="artista__nombre">{artista.nombre}</p>
                  <p className="artista__canciones">{cancionesDe(artista.canciones)}</p>
                  {artista.anios && <p className="artista__anios">{artista.anios}</p>}
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" className="archivo__flecha archivo__flecha--siguiente" aria-label="Siguiente" onClick={() => mover(1)}>
            <img src="/assets/arrow-right.svg" alt="" width={20} height={20} />
          </button>
        </div>
      )}

      {generos.length > 0 && (
        <ul className="archivo__generos" aria-label="Explorar por género">
          {[null, ...generos].map((nombre) => (
            <li key={nombre ?? "todos"}>
              <Link href={nombre === null ? "/archivo" : `/archivo/discos?${new URLSearchParams({ genero: nombre })}`} className="genero">
                {nombre ?? "Todos"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
