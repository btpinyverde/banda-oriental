import type { CancionCatalogo, Feedback, StemInfo, TipoStem } from "../juego/tipos";

/**
 * La canción de práctica del tutorial. Es de mentira (nombres inventados, para que no se confunda con el juego de
 * verdad) y su feedback se calcula acá solo para enseñar: en el juego real lo calcula el servidor.
 */
export const RESPUESTA: CancionCatalogo = {
  id: 1,
  title: "Noches de práctica",
  artist: "Los Ejemplares",
  album: "Primer ensayo",
  year: 1995,
  genre: "Rock",
};

/** Con las opciones se ven todos los casos: nada coincide, artista igual con otro disco, el mismo disco y el año. */
export const OPCIONES: CancionCatalogo[] = [
  { id: 2, title: "Calle sin nombre", artist: "Dúo Demo", album: "Maqueta", year: 1988, genre: "Candombe" },
  { id: 3, title: "Verano en la rambla", artist: "Los Ejemplares", album: "Segundo ensayo", year: 2001, genre: "Rock" },
  RESPUESTA,
  { id: 4, title: "Mañana temprano", artist: "Los Ejemplares", album: "Primer ensayo", year: 1995, genre: "Rock" },
  { id: 5, title: "Cielo de tambores", artist: "Sol y Luna", album: "Tambor", year: 2004, genre: "Candombe" },
];

const igual = (a: string, b: string): "same" | "different" => (a === b ? "same" : "different");

export function evaluar(intento: CancionCatalogo): Feedback {
  const anio = intento.year ?? 0;
  const objetivo = RESPUESTA.year ?? 0;
  return {
    year: anio === objetivo ? "exact" : objetivo > anio ? "newer" : "older",
    genre: igual(intento.genre, RESPUESTA.genre),
    artist: igual(intento.artist, RESPUESTA.artist),
    album: igual(intento.album, RESPUESTA.album),
  };
}

const ORDEN: TipoStem[] = ["drums", "bass", "other", "vocals"];

/** Las pistas abiertas en el intento `intento`: una más por cada error, en el orden del juego. */
export function pistasDesbloqueadas(intento: number): StemInfo[] {
  return ORDEN.slice(0, Math.min(intento, ORDEN.length)).map((stem_type, i) => ({ stem_type, unlock_order: i + 1, url: "" }));
}
