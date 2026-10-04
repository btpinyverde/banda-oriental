"use client";

import { useEffect, useState } from "react";
import { diaDeMontevideo } from "./logica";

const REVISAR_CADA_MS = 15_000;

/**
 * El día de hoy en Montevideo ("2026-10-03"), que se mantiene al día solo: si la página queda abierta pasada la
 * medianoche, pasa al día siguiente sin recargar.
 */
export function useDiaActual(): string {
  const [dia, setDia] = useState(() => diaDeMontevideo(new Date()));

  useEffect(() => {
    const revisar = () => setDia(diaDeMontevideo(new Date()));
    revisar();
    const temporizador = window.setInterval(revisar, REVISAR_CADA_MS);
    return () => window.clearInterval(temporizador);
  }, []);

  return dia;
}
