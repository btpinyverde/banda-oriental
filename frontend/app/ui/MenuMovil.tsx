"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

type Enlace = { href: string; etiqueta: string };

/** Menú hamburguesa de la navbar. Solo se ve en pantallas chicas (el CSS lo oculta en desktop). */
export function MenuMovil({ enlaces }: { enlaces: Enlace[] }) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  const cerrar = () => setAbierto(false);

  return (
    <div className="menu-movil">
      <button
        type="button"
        className="menu-movil__boton"
        aria-expanded={abierto}
        aria-controls={idPanel}
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setAbierto((estado) => !estado)}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          {abierto ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {abierto && (
        <nav id={idPanel} className="menu-movil__panel" aria-label="Menú">
          <ul>
            {enlaces.map(({ href, etiqueta }) => (
              <li key={href}>
                <Link href={href} onClick={cerrar}>
                  {etiqueta}
                </Link>
              </li>
            ))}
          </ul>
          <div className="menu-movil__acciones">
            <Link href="/login" className="boton boton--grande boton--claro" onClick={cerrar}>
              Iniciar sesión
            </Link>
            <Link href="/jugar" className="boton boton--grande boton--violeta" onClick={cerrar}>
              <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
                <path d="M1 1.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 1 1.5Z" />
              </svg>
              Jugar el diario
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
