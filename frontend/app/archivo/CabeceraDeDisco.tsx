import Link from "next/link";
import { rutaDeDiscosDe } from "../lib/archivo-musical";
import { SinImagen } from "./SinImagen";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** La cabecera de la página de un disco: su tapa (o el vinilo sobre papel si no tiene), su nombre y sus datos. */
export function CabeceraDeDisco({
  id,
  nombre,
  artista,
  anio,
  genero,
  canciones,
  tapa,
}: {
  id: number;
  nombre: string;
  artista: { id: number; name: string };
  anio: number | null;
  genero: string;
  canciones: number;
  tapa?: string;
}) {
  return (
    <section className="cabecera-artista">
      <div className="cabecera-artista__foto">
        {tapa ? (
          <div className="tarjeta__tapa">
            <img src={tapa} alt={`Tapa de ${nombre}`} width={320} height={320} referrerPolicy="no-referrer" />
          </div>
        ) : (
          <SinImagen tipo="disco" lugar={id} />
        )}
      </div>
      <div className="cabecera-artista__texto">
        <Link href="/archivo/discos" className="cabecera-artista__volver">
          ← Todos los discos
        </Link>
        <p className="hero-archivo__etiqueta">Disco</p>
        <h1>{nombre}</h1>
        <ul className="cabecera-artista__datos">
          <li>
            <Link href={rutaDeDiscosDe(artista)}>{artista.name}</Link>
          </li>
          {anio && <li>{anio}</li>}
          {genero && <li>{genero}</li>}
          <li>{plural(canciones, "canción", "canciones")}</li>
        </ul>
        <p className="cabecera-artista__aviso">
          <Link href={`/archivo/reportar?${new URLSearchParams({ tipo: "disco", id: String(id), nombre })}`}>¿Algo no está bien? Avisanos</Link>
        </p>
      </div>
    </section>
  );
}
