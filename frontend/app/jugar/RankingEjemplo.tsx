import Link from "next/link";

/**
 * MAQUETA con datos inventados: el ranking del día. El backend todavía no lo muestra con cuentas, así que solo se
 * ve en modo demo (ver esModoDemo en lib/juego/cliente.ts) y avisa que son de ejemplo.
 */
const RANKING = [
  { puesto: 1, nombre: "lucas", puntos: "1.240 pts" },
  { puesto: 2, nombre: "sol", puntos: "1.180 pts" },
  { puesto: 3, nombre: "manu", puntos: "980 pts" },
  { puesto: 4, nombre: "brandon", puntos: "920 pts", yo: true },
  { puesto: 5, nombre: "caro", puntos: "860 pts" },
] as const;

export function RankingEjemplo() {
  return (
    <>
      <section aria-labelledby="lateral-ranking">
        <div className="lateral__cabecera">
          <h2 id="lateral-ranking" className="lateral__titulo">
            Ranking del día
          </h2>
          <Link href="/ranking" className="lateral__ver-todos">
            Ver todos →
          </Link>
        </div>
        <ol className="lateral__ranking">
          {RANKING.map((fila) => (
            <li key={fila.puesto} className={`lateral__fila${"yo" in fila ? " lateral__fila--yo" : ""}`}>
              <span className="lateral__puesto">{fila.puesto}</span>
              <span className="lateral__avatar" aria-hidden="true">
                {fila.nombre[0].toUpperCase()}
              </span>
              <span className="lateral__nombre">{fila.nombre}</span>
              <span className="lateral__aciertos">{fila.puntos}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="lateral__nota">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.5v.5" />
        </svg>
        El ranking se calcula por puntaje: menos intentos = más puntos.
      </p>

      <p className="lateral__aviso">Datos de ejemplo</p>
    </>
  );
}
