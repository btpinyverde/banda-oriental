"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Si todavía hay más jugadores por traer. */
  hayMas: boolean;
  cargando: boolean;
  error: boolean;
  /** Cuántas filas hay: al cambiar se vuelve a mirar el final, por si la lista sigue sin llenar la pantalla. */
  filas: number;
  alVer: () => void;
};

/**
 * El final de la lista del ranking: al asomarse en pantalla pide la página siguiente. Si el navegador no puede observar el
 * scroll, ofrece un botón. Si la página falla, lo dice acá y deja reintentar, sin tocar lo que ya se cargó.
 */
export function FinDeLaLista({ hayMas, cargando, error, filas, alVer }: Props) {
  const marca = useRef<HTMLDivElement>(null);
  const pedir = useRef(alVer);
  pedir.current = alVer;
  const puedeObservar = typeof IntersectionObserver !== "undefined";

  useEffect(() => {
    const elemento = marca.current;
    if (!hayMas || error || !puedeObservar || !elemento) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) pedir.current();
    }, { rootMargin: "300px 0px" });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [hayMas, error, puedeObservar, filas]);

  if (error) {
    return (
      <div className="ranking__final" role="alert">
        <p>No pudimos cargar más jugadores.</p>
        <button type="button" className="boton boton--violeta" onClick={alVer}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!hayMas) return null;
  return (
    <div className="ranking__final" ref={marca}>
      {cargando ? (
        <p role="status">Cargando más jugadores…</p>
      ) : (
        !puedeObservar && (
          <button type="button" className="boton boton--contorno" onClick={alVer}>
            Ver más jugadores
          </button>
        )
      )}
    </div>
  );
}
