"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ColageDelAcceso } from "../cuenta/ColageDelAcceso";
import { FormularioCuenta, type Modo } from "../cuenta/FormularioCuenta";
import { useSesion } from "../lib/cuenta/useSesion";

/** El contenido de /login: el formulario con su collage, o un aviso si ya hay una sesión iniciada. */
export function PantallaLogin() {
  const router = useRouter();
  const { sesion, lista } = useSesion();
  // Con qué modo se abre sale de la dirección (/login?modo=crear); se lee después de montar, así servidor y navegador dibujan lo mismo.
  const [modoInicial, setModoInicial] = useState<Modo | null>(null);
  const [modo, setModo] = useState<Modo>("entrar");

  useEffect(() => {
    const inicial: Modo = new URLSearchParams(window.location.search).get("modo") === "crear" ? "crear" : "entrar";
    setModoInicial(inicial);
    setModo(inicial);
  }, []);

  const dentro = (contenido: ReactNode) => (
    <div className={`acceso__marco acceso__marco--${modo}`}>
      <header className="acceso__barra">
        <Link href="/" className="acceso__logo" aria-label="Banda Oriental, inicio">
          <img src="/assets/brand-wordmark.svg" alt="Banda Oriental" width={150} height={80} />
        </Link>
        <Link href="/" className="acceso__volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Volver al inicio
        </Link>
      </header>
      {contenido}
    </div>
  );

  if (!lista || modoInicial === null) return dentro(<div className="acceso__formulario" aria-busy="true" />);

  if (sesion) {
    return dentro(
      <div className="acceso__formulario acceso__formulario--sesion">
        <h1 className="acceso__titulo">Ya estás adentro</h1>
        <div className="acceso__tarjeta">
          <p className="acceso__aviso" role="status">
            Ya iniciaste sesión{sesion.email ? ` como ${sesion.email}` : ""}.
          </p>
          <Link href="/jugar" className="acceso__enviar">
            Jugar el diario
          </Link>
          <Link href="/cuenta" className="acceso__enviar acceso__enviar--claro">
            Ir a mi cuenta
          </Link>
        </div>
      </div>,
    );
  }

  return dentro(
    <>
      <FormularioCuenta modoInicial={modoInicial} alCambiarModo={setModo} alEntrar={() => router.push("/jugar")} />
      <ColageDelAcceso modo={modo} />
    </>,
  );
}
