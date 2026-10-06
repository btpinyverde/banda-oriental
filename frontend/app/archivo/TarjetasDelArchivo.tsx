"use client";

import Link from "next/link";
import { useState } from "react";
import { rutaDeArtista, rutaDeDisco, type ArtistaFila, type DiscoFila } from "../lib/archivo-musical";
import { FotoDelArtista } from "../ui/FotoDelArtista";

const TONOS = 5;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const aniosDe = (desde: number | null, hasta: number | null) => (desde && hasta ? (desde === hasta ? String(desde) : `${desde}–${hasta}`) : "");

/** Un artista del archivo: su foto (o la inicial sobre un color que toca por su lugar en la lista), sus canciones y sus años. */
export function TarjetaDeArtista({ artista, lugar }: { artista: ArtistaFila; lugar: number }) {
  const anios = aniosDe(artista.first_year, artista.last_year);
  return (
    <li className="tarjeta">
      <FotoDelArtista nombre={artista.name} foto={artista.picture_url || undefined} tono={lugar % TONOS} clase="tarjeta__foto" />
      <Link href={rutaDeArtista(artista)} className="tarjeta__titulo tarjeta__enlace-principal">
        {artista.name}
      </Link>
      <span className="tarjeta__disco">{plural(artista.songs, "canción", "canciones")}</span>
      {anios && <span className="tarjeta__anio">{anios}</span>}
    </li>
  );
}

/** Un disco del archivo: su tapa, su nombre, el artista, el año, las canciones y el género. */
export function TarjetaDeDisco({ disco }: { disco: DiscoFila }) {
  const tapa = disco.cover_art_url ?? "";
  // Se recuerda qué tapa falló, no un "falló" suelto: con otra tapa se vuelve a intentar.
  const [fallida, setFallida] = useState<string | null>(null);
  const hayTapa = tapa.startsWith("https://") && fallida !== tapa;
  return (
    <li className="tarjeta">
      <div className={hayTapa ? "tarjeta__tapa" : `tarjeta__tapa tarjeta__tapa--sin tarjeta__tapa--tono-${disco.id % TONOS}`}>
        {hayTapa ? (
          <img src={tapa} alt={`Tapa de ${disco.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFallida(tapa)} />
        ) : (
          <img className="tarjeta__nota" src="/assets/music-note.svg" alt="" aria-hidden="true" />
        )}
      </div>
      <Link href={rutaDeDisco(disco)} className="tarjeta__titulo tarjeta__enlace-principal">
        {disco.name}
      </Link>
      <Link href={rutaDeArtista(disco.artist)} className="tarjeta__artista">
        {disco.artist.name}
      </Link>
      {disco.year && <span className="tarjeta__anio">{disco.year}</span>}
      <span className="tarjeta__disco">{plural(disco.songs, "canción", "canciones")}</span>
      {disco.genre && <span className="tarjeta__genero">{disco.genre}</span>}
    </li>
  );
}
