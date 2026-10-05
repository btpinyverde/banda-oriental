import Link from "next/link";

/** Los números de página que se muestran: los primeros, los últimos o la vecindad de la actual, con "…" en los saltos. */
export function numerosDePagina(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (actual <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (actual >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", actual - 1, actual, actual + 1, "…", total];
}

/** Los enlaces entre páginas de una lista, con números, como en el diseño; conservan los filtros puestos. */
export function PaginasNumeradas({ pagina, paginas, ruta, parametros }: { pagina: number; paginas: number; ruta: string; parametros: Record<string, string> }) {
  if (paginas <= 1) return null;
  const hacia = (numero: number) => {
    const busqueda = new URLSearchParams(parametros);
    if (numero > 1) busqueda.set("pagina", String(numero));
    const texto = busqueda.toString();
    return texto ? `${ruta}?${texto}` : ruta;
  };
  return (
    <nav className="paginas" aria-label="Páginas">
      {pagina > 1 ? (
        <Link href={hacia(pagina - 1)} className="paginas__flecha" aria-label="Página anterior">
          ‹
        </Link>
      ) : (
        <span className="paginas__flecha paginas__flecha--apagada" aria-hidden="true">‹</span>
      )}
      {numerosDePagina(pagina, paginas).map((numero, indice) =>
        numero === "…" ? (
          <span key={`salto-${indice}`} className="paginas__salto">…</span>
        ) : numero === pagina ? (
          <span key={numero} className="paginas__numero paginas__numero--actual" aria-current="page">{numero}</span>
        ) : (
          <Link key={numero} href={hacia(numero)} className="paginas__numero" aria-label={`Página ${numero}`}>
            {numero}
          </Link>
        ),
      )}
      {pagina < paginas ? (
        <Link href={hacia(pagina + 1)} className="paginas__flecha" aria-label="Página siguiente">
          ›
        </Link>
      ) : (
        <span className="paginas__flecha paginas__flecha--apagada" aria-hidden="true">›</span>
      )}
    </nav>
  );
}
