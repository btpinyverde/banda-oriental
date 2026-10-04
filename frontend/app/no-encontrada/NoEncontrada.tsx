import Link from "next/link";

export interface FotosNoEncontrada {
  bus?: string;
}

const ALT_BUS = "Ómnibus de la línea 404, con destino Palacio de la Luz – Complejo Juana de América";

/**
 * Página de error 404: un chiste local (el ómnibus 404 de Montevideo, que une el Palacio de la Luz con el Complejo
 * Juana de América) para explicar qué es un 404. La foto recortada del ómnibus se pasa por `fotos.bus`; mientras no esté
 * queda un espacio en su lugar.
 */
export function NoEncontrada({ fotos = {} }: { fotos?: FotosNoEncontrada }) {
  return (
    <main className="nf">
      <div className="nf__texto">
        <p className="nf__eyebrow">ERROR 404</p>

        <h1 className="nf__titulo">
          El 404 <span className="nf__resaltado">sí existe.</span> <br />
          Esta página no.
        </h1>

        <p className="nf__bajada">
          El 404 es un ómnibus real de Montevideo que conecta dos puntos de la ciudad:{" "}
          <strong className="nf__ruta-texto">Palacio de la Luz ⇄ Complejo Juana de América.</strong>
        </p>
        <p className="nf__bajada">
          En cambio, el error 404 aparece cuando intentás llegar a una página que no existe.
        </p>

        <div className="nf__recorrido" role="group" aria-label="Recorrido del 404">
          <p className="nf__punto">
            <span className="nf__aro" aria-hidden="true" />
            Palacio de la Luz
          </p>
          <span className="nf__tramo" aria-hidden="true">
            <span className="nf__linea" />
            <img src="/assets/404/icono-bus.svg" alt="" width={40} height={33} />
            <span className="nf__linea" />
          </span>
          <p className="nf__punto nf__punto--fin">
            Complejo Juana de América
            <span className="nf__aro" aria-hidden="true" />
          </p>
        </div>

        <div className="nf__acciones">
          <Link href="/" className="boton boton--grande boton--violeta">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />
            </svg>
            Volver al inicio
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 24h33M28 11l13 13-13 13" />
            </svg>
          </Link>
          <Link href="/archivo" className="boton boton--grande boton--claro">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m20 20-4.5-4.5" />
            </svg>
            Explorar el archivo
          </Link>
        </div>
      </div>

      <div className="nf__collage">
        <img className="nf__mancha nf__mancha--amarilla" src="/assets/hero-blob-yellow.svg" alt="" />
        <img className="nf__mancha nf__mancha--rosa" src="/assets/jugar-mancha-rosa-nota.svg" alt="" />
        <img className="nf__mancha nf__mancha--rosa-chica" src="/assets/jugar-mancha-rosa-nota.svg" alt="" />

        {fotos.bus ? (
          <img className="nf__foto" src={fotos.bus} alt={ALT_BUS} />
        ) : (
          <div className="nf__foto nf__foto--vacia" aria-hidden="true" />
        )}

        <img
          className="nf__nota"
          src="/assets/404/nota-404.svg"
          alt="El 404 te lleva de un lado al otro. Esta página, a ninguno."
        />
        <img className="nf__flecha" src="/assets/404/flecha-curva.svg" alt="" />
        <img className="nf__flor" src="/assets/jugar-flor.svg" alt="" />
        <img className="nf__rayas nf__rayas--a" src="/assets/hero-rays-claim.svg" alt="" />
        <img className="nf__rayas nf__rayas--b" src="/assets/hero-rays-left.svg" alt="" />
        <img className="nf__rayas nf__rayas--c" src="/assets/hero-rays-pair.svg" alt="" />
      </div>
    </main>
  );
}
