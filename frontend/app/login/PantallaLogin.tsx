"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormularioCuenta } from "../cuenta/FormularioCuenta";
import { useSesion } from "../lib/cuenta/useSesion";

/** El contenido de /login: el formulario, o un aviso si ya hay una sesión iniciada. */
export function PantallaLogin() {
  const router = useRouter();
  const { sesion, lista } = useSesion();

  if (!lista) return <div className="cuenta__tarjeta" aria-busy="true" />;

  if (sesion) {
    return (
      <div className="cuenta__tarjeta">
        <p className="cuenta__aviso" role="status">
          Ya iniciaste sesión{sesion.email ? ` como ${sesion.email}` : ""}.
        </p>
        <div className="cuenta__acciones">
          <Link href="/jugar" className="boton boton--grande boton--violeta">
            Jugar el diario
          </Link>
          <Link href="/cuenta" className="boton boton--grande boton--claro">
            Ir a mi cuenta
          </Link>
        </div>
      </div>
    );
  }

  return <FormularioCuenta alEntrar={() => router.push("/jugar")} />;
}
