"use client";

import { useEffect, useState } from "react";
import { crearApiCuenta } from "../cuenta/api-cuenta";
import { useSesion } from "../cuenta/useSesion";
import { batallaActiva } from "../funciones";

/**
 * Si esta persona puede ver y usar el modo batalla para crear salas. Mientras se lo prueba, solo algunas cuentas pueden
 * (el servidor lo decide y lo dice en `/api/me/`); con el interruptor `NEXT_PUBLIC_BATALLA_ACTIVA` encendido es para todos.
 * Entrar a una sala con su enlace no pasa por acá: eso está abierto a quien tenga el enlace.
 */
export function usePuedeCrearBatallas(): { puede: boolean; lista: boolean } {
  const abierto = batallaActiva();
  const { sesion, lista } = useSesion();
  const token = sesion?.token ?? null;
  const [permiso, setPermiso] = useState<boolean | null>(null);

  useEffect(() => {
    if (abierto || !lista) return;
    if (!token) {
      setPermiso(false);
      return;
    }
    let activo = true;
    setPermiso(null);
    crearApiCuenta()
      .yo(token)
      .then((datos) => activo && setPermiso(datos.can_create_battles === true))
      .catch(() => activo && setPermiso(false)); // sin saberlo, no se muestra
    return () => {
      activo = false;
    };
  }, [abierto, lista, token]);

  if (abierto) return { puede: true, lista: true };
  return { puede: permiso === true, lista: lista && permiso !== null };
}
