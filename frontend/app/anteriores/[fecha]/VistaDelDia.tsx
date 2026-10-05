import Link from "next/link";
import type { DetalleDelDia } from "../../lib/anteriores";
import { fechaLarga } from "../../lib/fechas";

/** El usuario de Instagram sin arroba, o `null` si falta o trae algo que no es un usuario (no se arma un enlace con eso). */
function usuarioDeInstagram(valor: string): string | null {
  const limpio = valor.trim().match(/^@?([A-Za-z0-9._]{1,30})$/);
  return limpio ? limpio[1] : null;
}

/** Un día anterior: la canción revelada, con su artista y disco, y el enlace al Instagram del artista si se cargó. */
export function VistaDelDia({ dia }: { dia: DetalleDelDia }) {
  const instagram = usuarioDeInstagram(dia.artist_instagram_handle);

  return (
    <main className="archivo-publico archivo-publico--dia">
      <p className="archivo-publico__fecha">{fechaLarga(dia.date)}</p>
      <h1>{dia.song_title}</h1>
      <dl className="archivo-publico__datos">
        <div>
          <dt>Artista</dt>
          <dd>{dia.artist}</dd>
        </div>
        <div>
          <dt>Disco</dt>
          <dd>{dia.album}</dd>
        </div>
      </dl>

      {instagram && (
        <p>
          <a href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener noreferrer">
            {dia.artist} en Instagram
          </a>
        </p>
      )}

      <div className="archivo-publico__acciones">
        <Link href="/anteriores" className="boton boton--violeta">
          ← Volver a los juegos anteriores
        </Link>
        <Link href="/jugar" className="boton boton--grande boton--violeta">
          Jugar el diario
        </Link>
      </div>
    </main>
  );
}
