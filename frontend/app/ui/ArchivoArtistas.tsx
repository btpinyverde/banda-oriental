"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FotoDelArtista } from "./FotoDelArtista";
import { Ondulada } from "./Ondulada";

export type ArtistaArchivo = {
  id: number | string;
  nombre: string;
  canciones: number;
  /** La ficha del artista en el archivo. */
  href: string;
  /** La foto del artista (de Deezer). Si falta, va la inicial de su nombre sobre un color de la marca. */
  foto?: string;
  /** La foto sin fondo que se sube desde el admin. Si está, va en lugar de la de Deezer. */
  recorte?: string;
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

/** Bajada de la sección, partida en lo que va en negrita (el total) y el resto. */
export function partesDelCatalogo(canciones: number): { destacado: string; resto: string } {
  if (canciones >= 100) return { destacado: `Más de ${new Intl.NumberFormat("es-UY").format(Math.floor(canciones / 100) * 100)} canciones`, resto: COLA_DE_LA_BAJADA };
  if (canciones > 0) return { destacado: `${canciones} ${canciones === 1 ? "canción" : "canciones"}`, resto: COLA_DE_LA_BAJADA };
  return { destacado: "", resto: "Canciones uruguayas de todas las épocas, géneros y rincones del país." };
}

/** Bajada de la sección, con el total de canciones del catálogo. */
export function textoCatalogo(canciones: number): string {
  const { destacado, resto } = partesDelCatalogo(canciones);
  return destacado ? `${destacado} ${resto}` : resto;
}

const cancionesDe = (n: number) => `${n} ${n === 1 ? "canción" : "canciones"}`;

/** Vitrina del archivo: un carrusel de artistas del catálogo y atajos a los géneros. */
export function ArchivoArtistas({ artistas, generos, totalCanciones }: Props) {
  const fila = useRef<HTMLUListElement>(null);
  // Las flechas solo tienen sentido si las tarjetas no entran todas: se mide la fila y se vuelve a medir si cambia el ancho.
  const [desborda, setDesborda] = useState(true);

  useEffect(() => {
    const lista = fila.current;
    if (!lista) return;
    const medir = () => setDesborda(lista.scrollWidth > lista.clientWidth + 1);
    medir();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(lista);
    window.addEventListener("resize", medir);
    return () => {
      observador?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [artistas.length]);

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
          <p className="archivo__eyebrow">Explorá la música uruguaya</p>
          <h2 className="archivo__titulo" id="archivo-titulo">
            <span className="resaltado">Explorá</span> el <span className="resaltado-movil">archivo</span>
          </h2>
          <p className="archivo__bajada">
            {partesDelCatalogo(totalCanciones).destacado && <strong>{partesDelCatalogo(totalCanciones).destacado}</strong>}{" "}
            {partesDelCatalogo(totalCanciones).resto}
          </p>
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
          {desborda && (
            <button type="button" className="archivo__flecha archivo__flecha--anterior" aria-label="Anterior" onClick={() => mover(-1)}>
              <img src="/assets/arrow-right.svg" alt="" width={20} height={20} />
            </button>
          )}
          <ul className="archivo__fila" ref={fila}>
            {artistas.map((artista, lugar) => (
              <li key={artista.id} className="artista">
                <Link href={artista.href} className="artista__enlace">
                  <FotoDelArtista nombre={artista.nombre} foto={artista.foto} recorte={artista.recorte} tono={lugar % 5} />
                  <p className="artista__nombre">{artista.nombre}</p>
                  <p className="artista__canciones">{cancionesDe(artista.canciones)}</p>
                  {artista.anios && <p className="artista__anios">{artista.anios}</p>}
                </Link>
              </li>
            ))}
          </ul>
          {desborda && (
            <button type="button" className="archivo__flecha archivo__flecha--siguiente" aria-label="Siguiente" onClick={() => mover(1)}>
              <img src="/assets/arrow-right.svg" alt="" width={20} height={20} />
            </button>
          )}
        </div>
      )}

      {generos.length > 0 && (
        <ul className="archivo__generos" aria-label="Explorar por género">
          {[null, ...generos].map((nombre) => (
            <li key={nombre ?? "todos"}>
              <Link
                href={nombre === null ? "/archivo" : `/archivo/discos?${new URLSearchParams({ genero: nombre })}`}
                className={nombre === null ? "genero genero--activo" : "genero"}
              >
                {nombre ?? "Todos"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
