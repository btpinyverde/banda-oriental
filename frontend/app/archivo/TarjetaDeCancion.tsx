"use client";

import Link from "next/link";
import { useState } from "react";
import { rutaDeDisco, rutaDeDiscosDe, type CancionFila } from "../lib/archivo-musical";
import { SinImagen } from "./SinImagen";

const TONOS = 5;
const TONOS_CONOCIDOS: Record<string, number> = { rock: 1, pop: 2, candombe: 0, tango: 3, folklore: 4 };

const hash = (texto: string) => [...texto].reduce((suma, c) => suma + c.charCodeAt(0), 0);
/** Un color de la marca por género, siempre el mismo (sin importar mayúsculas): los conocidos tienen el suyo fijo. */
const tonoDelGenero = (genero: string) => TONOS_CONOCIDOS[genero.trim().toLowerCase()] ?? hash(genero.trim().toLowerCase()) % TONOS;

/** Una canción del archivo: la tapa de su disco, el título, el artista, el año y el género. */
export function TarjetaDeCancion({ cancion, lugar }: { cancion: CancionFila; lugar?: number }) {
  // Un servidor más viejo que el sitio puede no mandar la tapa: se trata como "sin tapa", no como un error.
  const tapa = cancion.album.cover_art_url ?? "";
  // Se recuerda qué tapa falló, no un "falló" suelto: con otra tapa se vuelve a intentar.
  const [fallida, setFallida] = useState<string | null>(null);
  const hayTapa = tapa.startsWith("https://") && fallida !== tapa;
  const dia = typeof cancion.played_on === "string" ? cancion.played_on : null;
  return (
    <li className="tarjeta">
      {hayTapa ? (
        <div className="tarjeta__tapa">
          <img src={tapa} alt={`Tapa de ${cancion.album.name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFallida(tapa)} />
        </div>
      ) : (
        <SinImagen tipo="cancion" lugar={lugar ?? cancion.id} />
      )}
      <Link href={rutaDeDisco(cancion.album)} className="tarjeta__titulo tarjeta__enlace-principal">
        {cancion.title}
      </Link>
      <Link href={rutaDeDiscosDe(cancion.artist)} className="tarjeta__artista">
        {cancion.artist.name}
      </Link>
      {cancion.album.name && <span className="tarjeta__disco">{cancion.album.name}</span>}
      {cancion.album.year && <span className="tarjeta__anio">{cancion.album.year}</span>}
      {cancion.album.genre && <span className={`tarjeta__genero tarjeta__genero--tono-${tonoDelGenero(cancion.album.genre)}`}>{cancion.album.genre}</span>}
      {dia && (
        <Link href={`/anteriores/${dia}`} className="tarjeta__dia">
          Fue la canción del día
        </Link>
      )}
    </li>
  );
}
