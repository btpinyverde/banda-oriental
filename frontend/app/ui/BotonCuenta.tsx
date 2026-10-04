"use client";

import Link from "next/link";
import { useSesion } from "../lib/cuenta/useSesion";

/**
 * El botón de la cuenta en la barra y en el menú del celular: "Iniciar sesión" si no hay sesión y "Mi cuenta" si la hay.
 * En el servidor siempre sale "Iniciar sesión" (no se sabe todavía); se corrige al montar.
 */
export function BotonCuenta({ className, alElegir }: { className: string; alElegir?: () => void }) {
  const { sesion } = useSesion();

  return sesion ? (
    <Link href="/cuenta" className={className} onClick={alElegir}>
      Mi cuenta
    </Link>
  ) : (
    <Link href="/login" className={className} onClick={alElegir}>
      Iniciar sesión
    </Link>
  );
}
