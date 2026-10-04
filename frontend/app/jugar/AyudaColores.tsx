"use client";

import { useEffect, useId, useState } from "react";

const SIGNIFICADOS = [
  { clase: "acierto", titulo: "Correcto", texto: "La canción y el dato coinciden." },
  { clase: "cerca", titulo: "Cerca", texto: "El dato es correcto pero no exacto." },
  { clase: "error", titulo: "Incorrecto", texto: "El dato no coincide." },
] as const;

/** Botón "?" junto al título: abre un cuadro con lo que significa cada color de la tabla. */
export function AyudaColores() {
  const [abierta, setAbierta] = useState(false);
  const idPanel = useId();

  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierta(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierta]);

  return (
    <>
      <button
        type="button"
        className="ayuda__boton"
        aria-label="Cómo funciona"
        aria-expanded={abierta}
        aria-controls={abierta ? idPanel : undefined}
        onClick={() => setAbierta((actual) => !actual)}
      >
        ?
      </button>

      {abierta && (
        <section id={idPanel} className="ayuda" aria-label="Cómo funciona">
          <div className="ayuda__cabecera">
            <h2>Cómo funciona</h2>
            <button type="button" className="ayuda__cerrar" aria-label="Cerrar" onClick={() => setAbierta(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
          <ul>
            {SIGNIFICADOS.map(({ clase, titulo, texto }) => (
              <li key={clase}>
                <span className={`ayuda__punto ayuda__punto--${clase}`} aria-hidden="true" />
                <span>
                  <strong>{titulo}</strong>
                  {texto}
                </span>
              </li>
            ))}
          </ul>
          <p>Cada error desbloquea una nueva pista (instrumento). Tenés seis intentos.</p>
        </section>
      )}
    </>
  );
}
