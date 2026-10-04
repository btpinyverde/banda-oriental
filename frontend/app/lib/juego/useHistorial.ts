"use client";

import { useEffect, useState } from "react";
import { EVENTO_HISTORIAL, leerHistorial } from "./almacen-historial";
import type { Partida } from "./historial";

/**
 * El historial guardado en este dispositivo. Arranca vacío y se completa al montar (en el servidor no hay
 * nada que leer), y se mantiene al día cuando se guarda una partida o cuando otra pestaña lo cambia.
 */
export function useHistorial(): Partida[] {
  const [historial, setHistorial] = useState<Partida[]>([]);

  useEffect(() => {
    const actualizar = () => setHistorial(leerHistorial());
    actualizar();
    window.addEventListener(EVENTO_HISTORIAL, actualizar);
    window.addEventListener("storage", actualizar);
    return () => {
      window.removeEventListener(EVENTO_HISTORIAL, actualizar);
      window.removeEventListener("storage", actualizar);
    };
  }, []);

  return historial;
}
