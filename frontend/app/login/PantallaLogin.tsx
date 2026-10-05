"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  if (!lista || modoInicial === null) return <div className="acceso__formulario" aria-busy="true" />;

  if (sesion) {
    return (
      <div className="acceso__formulario">
        <h1 className="acceso__titulo">Ya estás adentro</h1>
        <p className="acceso__aviso" role="status">
          Ya iniciaste sesión{sesion.email ? ` como ${sesion.email}` : ""}.
        </p>
        <div className="acceso__acciones">
          <Link href="/jugar" className="acceso__enviar">
            Jugar el diario
          </Link>
          <Link href="/cuenta" className="acceso__enviar acceso__enviar--claro">
            Ir a mi cuenta
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <FormularioCuenta modoInicial={modoInicial} alCambiarModo={setModo} alEntrar={() => router.push("/jugar")} />
      <ColageDelAcceso modo={modo} />
    </>
  );
}
