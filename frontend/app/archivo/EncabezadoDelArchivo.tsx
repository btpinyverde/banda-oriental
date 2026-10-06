import { ColageDelArchivo } from "./ColageDelArchivo";
import { PestanasDelArchivo } from "./PestanasDelArchivo";
import { cantidad } from "./utiles";

type Cantidades = { canciones: number | null; artistas: number | null; discos: number | null };

/** El encabezado de todas las páginas del explorador del archivo: título, bajada con el total, pestañas y collage. */
export function EncabezadoDelArchivo({ actual, cantidades }: { actual: "canciones" | "artistas" | "discos"; cantidades: Cantidades }) {
  const total = cantidades.canciones;
  return (
    <section className="hero-archivo">
      <div className="hero-archivo__texto">
        <p className="hero-archivo__etiqueta">Archivo de música uruguaya</p>
        <h1>
          Explorá el <span className="hero-archivo__resaltado">archivo.</span>
        </h1>
        <p className="hero-archivo__bajada">
          {total !== null && total >= 100 ? `Más de ${cantidad(Math.floor(total / 100) * 100)} canciones, discos y artistas` : "Canciones, discos y artistas uruguayos"} de todas las épocas. Buscá, filtrá y descubrí.
        </p>
        <PestanasDelArchivo actual={actual} cantidades={cantidades} />
      </div>
      <ColageDelArchivo />
    </section>
  );
}
