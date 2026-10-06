import Link from "next/link";
import type { ChipDeGenero } from "./generos";

/** Los géneros para filtrar: "Todas" y cada uno, en el orden recibido. Elegir uno conserva los demás filtros y vuelve a la primera página. */
export function ChipsDeGenero({ generos, actual, parametros, conOtros = false }: { generos: (string | ChipDeGenero)[]; actual: string | undefined; parametros: Record<string, string>; conOtros?: boolean }) {
  const chips = generos.map((g) => (typeof g === "string" ? { valor: g, etiqueta: g } : g));
  const lista = actual && !chips.some((c) => c.valor.toLowerCase() === actual.toLowerCase()) ? [...chips, { valor: actual, etiqueta: actual }] : chips;
  const hacia = (genero?: string) => {
    const busqueda = new URLSearchParams(Object.entries(parametros).filter(([clave]) => clave !== "genero" && clave !== "pagina"));
    if (genero) busqueda.set("genero", genero);
    const texto = busqueda.toString();
    return texto ? `/archivo?${texto}` : "/archivo";
  };
  return (
    <ul className="chips" aria-label="Filtrar por género">
      <li>
        <Link href={hacia()} className="chip" aria-current={!actual ? "true" : undefined}>Todas</Link>
      </li>
      {lista.map(({ valor, etiqueta }) => (
        <li key={valor}>
          <Link href={hacia(valor)} className="chip" aria-current={actual?.toLowerCase() === valor.toLowerCase() ? "true" : undefined}>
            {etiqueta}
          </Link>
        </li>
      ))}
      {conOtros && (
        <li>
          {/* Lleva al selector de géneros, con todos los del catálogo. */}
          <a href="#filtro-generos" className="chip">
            Otros
          </a>
        </li>
      )}
    </ul>
  );
}
