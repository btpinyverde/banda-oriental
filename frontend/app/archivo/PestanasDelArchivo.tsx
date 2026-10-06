import Link from "next/link";

type Vista = "canciones" | "artistas" | "discos";

const PESTANAS: { vista: Vista; etiqueta: string; href: string }[] = [
  { vista: "canciones", etiqueta: "Canciones", href: "/archivo" },
  { vista: "artistas", etiqueta: "Artistas", href: "/archivo/artistas" },
  { vista: "discos", etiqueta: "Discos", href: "/archivo/discos" },
];

const numero = new Intl.NumberFormat("es-UY");

/** Las tres vistas del archivo, como pestañas con la cantidad de cada cosa (sin la cantidad si no se sabe: nunca un cero inventado). */
export function PestanasDelArchivo({ actual, cantidades }: { actual: Vista; cantidades: Record<Vista, number | null> }) {
  return (
    <nav className="pestanas" aria-label="Qué explorar">
      {PESTANAS.map(({ vista, etiqueta, href }) => (
        <Link key={vista} href={href} className="pestana" aria-current={vista === actual ? "page" : undefined}>
          <span className="pestana__nombre">{etiqueta}</span>
          {cantidades[vista] !== null && <span className="pestana__cantidad">{numero.format(cantidades[vista] as number)}</span>}
        </Link>
      ))}
    </nav>
  );
}
