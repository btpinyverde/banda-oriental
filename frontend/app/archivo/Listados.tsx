import Link from "next/link";
import { rutaDeArtista, rutaDeCancion, rutaDeDisco, type ArtistaFila, type CancionFila, type DiscoFila } from "../lib/archivo-musical";

/** Minutos y segundos ("3:45"); vacío si no se sabe. */
export function duracion(segundos: number | null): string {
  return segundos ? `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}` : "";
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const aniosDe = (desde: number | null, hasta: number | null) => (desde && hasta ? (desde === hasta ? String(desde) : `${desde}–${hasta}`) : "");
const unir = (partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" · ");

export function FilaDeArtista({ artista }: { artista: ArtistaFila }) {
  return (
    <li className="archivo-fila">
      <Link href={rutaDeArtista(artista)} className="archivo-fila__titulo">
        {artista.name}
      </Link>
      <span className="archivo-fila__datos">
        {unir([plural(artista.albums, "disco", "discos"), plural(artista.songs, "canción", "canciones"), aniosDe(artista.first_year, artista.last_year)])}
      </span>
    </li>
  );
}

export function FilaDeDisco({ disco }: { disco: DiscoFila }) {
  return (
    <li className="archivo-fila">
      <Link href={rutaDeDisco(disco)} className="archivo-fila__titulo">
        {disco.name}
      </Link>
      <span className="archivo-fila__datos">
        <Link href={rutaDeArtista(disco.artist)}>{disco.artist.name}</Link>
        {unir(["", disco.year ? String(disco.year) : "", disco.genre, plural(disco.songs, "canción", "canciones")])}
      </span>
    </li>
  );
}

export function FilaDeCancion({ cancion }: { cancion: CancionFila }) {
  const disco = cancion.album.name + (cancion.album.year ? ` (${cancion.album.year})` : "");
  const dia = typeof cancion.played_on === "string" ? cancion.played_on : null;
  return (
    <li className="archivo-fila">
      <Link href={rutaDeCancion(cancion)} className="archivo-fila__titulo">
        {cancion.title}
      </Link>
      <span className="archivo-fila__datos">
        <Link href={rutaDeArtista(cancion.artist)}>{cancion.artist.name}</Link>
        {` · `}
        <Link href={rutaDeDisco(cancion.album)}>{disco}</Link>
        {duracion(cancion.duration_seconds) && ` · ${duracion(cancion.duration_seconds)}`}
      </span>
      {dia && (
        <Link href={`/anteriores/${dia}`} className="archivo-fila__dia">
          Fue la canción del día ({dia})
        </Link>
      )}
    </li>
  );
}

/** Los enlaces entre páginas de una lista; conservan los filtros que ya estaban puestos. */
export function Paginacion({ pagina, paginas, ruta, parametros }: { pagina: number; paginas: number; ruta: string; parametros: Record<string, string> }) {
  if (paginas <= 1) return null;
  const hacia = (numero: number) => {
    const busqueda = new URLSearchParams(parametros);
    if (numero > 1) busqueda.set("pagina", String(numero));
    const texto = busqueda.toString();
    return texto ? `${ruta}?${texto}` : ruta;
  };
  return (
    <nav className="archivo-paginas" aria-label="Páginas">
      {pagina > 1 && <Link href={hacia(pagina - 1)}>Anterior</Link>}
      <span aria-current="page">{`Página ${pagina} de ${paginas}`}</span>
      {pagina < paginas && <Link href={hacia(pagina + 1)}>Siguiente</Link>}
    </nav>
  );
}
