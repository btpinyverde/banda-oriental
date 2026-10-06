import Link from "next/link";
import { FotoDelArtista } from "../ui/FotoDelArtista";
import { SinImagen } from "./SinImagen";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * La cabecera de la página de un artista (sus discos): su foto, su nombre como título, cuánto tiene en el archivo y a dónde ir
 * después. Es lo que deja claro que se está viendo a ese artista y no una lista filtrada.
 */
export function CabeceraDeArtista({
  id,
  nombre,
  discos,
  canciones,
  anios,
  foto,
  recorte,
}: {
  id: number;
  nombre: string;
  discos: number;
  canciones: number | null;
  anios: string;
  /** Su foto de Deezer y, si es un artista destacado, la recortada que subió el admin (que va en lugar de la otra). */
  foto?: string;
  recorte?: string;
}) {
  return (
    <section className="cabecera-artista">
      <div className="cabecera-artista__foto">
        <FotoDelArtista nombre={nombre} foto={foto} recorte={recorte} tono={id % 5} clase="tarjeta__foto" vacio={<SinImagen tipo="artista" lugar={id} />} />
      </div>
      <div className="cabecera-artista__texto">
        <Link href="/archivo/discos" className="cabecera-artista__volver">
          ← Todos los discos
        </Link>
        <p className="hero-archivo__etiqueta">Artista</p>
        <h1>{nombre}</h1>
        <ul className="cabecera-artista__datos">
          <li>{plural(discos, "disco", "discos")}</li>
          {canciones !== null && <li>{plural(canciones, "canción", "canciones")}</li>}
          {anios && <li>{anios}</li>}
        </ul>
        <Link href={`/archivo/canciones?artista=${id}`} className="boton boton--contorno">
          Ver todas sus canciones
          <img src="/assets/arrow-right.svg" alt="" width={18} height={18} />
        </Link>
      </div>
    </section>
  );
}
