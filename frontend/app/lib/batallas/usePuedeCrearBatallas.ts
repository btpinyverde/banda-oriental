"use client";

import { useEffect, useState } from "react";
import { useSesion } from "../cuenta/useSesion";
import { crearApiBatallas } from "./api-batallas";

/**
 * Si esta persona puede crear salas de batalla. Lo decide siempre el servidor: mientras el modo se prueba, solo algunas cuentas
 * pueden; cuando se abre, cualquiera (con o sin cuenta). Entrar a una sala con su enlace no pasa por acá: está abierto.
 * Vuelve a preguntar al iniciar o cerrar sesión, porque el permiso es de la cuenta.
 */
export function usePuedeCrearBatallas(): { puede: boolean; lista: boolean } {
  const { sesion, lista: sesionLista } = useSesion();
  const token = sesion?.token ?? null;
  const [permiso, setPermiso] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sesionLista) return;
    let activo = true;
    setPermiso(null);
    crearApiBatallas()
      .acceso()
      .then((puede) => activo && setPermiso(puede))
      .catch(() => activo && setPermiso(false)); // sin saberlo, no se muestra
    return () => {
      activo = false;
    };
  }, [sesionLista, token]);

  return { puede: permiso === true, lista: sesionLista && permiso !== null };
}
