"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conexionDelNavegador, elegirCalidad, guardarAhorro, leerAhorro, type Calidad } from "./calidad-de-audio";

/**
 * Qué versión de las pistas bajar. Se fija una vez por intento (la cambia solo la persona, con "ahorrar datos"):
 * si cambiara a mitad de un intento, el reproductor se recargaría mientras suena.
 */
export function useCalidadDeAudio(dia: string, intento: number) {
  const [ahorrar, setAhorrar] = useState(false);
  const velocidad = useRef<number | undefined>(undefined);

  // Se lee después de montar (no al renderizar) para que servidor y navegador dibujen lo mismo.
  useEffect(() => setAhorrar(leerAhorro()), []);

  const alMedir = useCallback((bytesPorSegundo: number) => {
    velocidad.current = bytesPorSegundo;
  }, []);

  const cambiarAhorro = useCallback((valor: boolean) => {
    guardarAhorro(valor);
    setAhorrar(valor);
  }, []);

  // `dia` e `intento` no se usan adentro: están para volver a elegir al empezar cada intento.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calidad: Calidad = useMemo(
    () => elegirCalidad({ ahorrar, conexion: conexionDelNavegador(), velocidad: velocidad.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ahorrar, dia, intento],
  );

  return { calidad, ahorrar, cambiarAhorro, alMedir };
}
