"use client";

import { useEffect, useState } from "react";
import { EVENTO_SESION, leerSesion, type Sesion } from "./sesion";

/**
 * La sesión de este navegador. En el servidor no hay nada que leer, así que `lista` avisa cuándo ya se miró (para
 * no mostrar "Iniciar sesión" un instante a quien ya la tiene). Se mantiene al día cuando se inicia o se cierra la
 * sesión, en esta pestaña o en otra.
 */
export function useSesion(): { sesion: Sesion | null; lista: boolean } {
  const [estado, setEstado] = useState<{ sesion: Sesion | null; lista: boolean }>({ sesion: null, lista: false });

  useEffect(() => {
    const actualizar = () => setEstado({ sesion: leerSesion(), lista: true });
    actualizar();
    window.addEventListener(EVENTO_SESION, actualizar);
    window.addEventListener("storage", actualizar);
    return () => {
      window.removeEventListener(EVENTO_SESION, actualizar);
      window.removeEventListener("storage", actualizar);
    };
  }, []);

  return estado;
}
