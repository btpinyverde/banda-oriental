"use client";

import { useEffect, useRef, useState } from "react";
import { useSesion } from "../cuenta/useSesion";
import { EVENTO_HISTORIAL } from "./almacen-historial";
import { esModoDemo } from "./cliente";
import { idDeDispositivo } from "./dispositivo";
import { pedirEstadisticas } from "./estadisticas-servidor";
import type { EstadisticasServidor } from "./tipos";

/**
 * Las estadísticas de quien juega, calculadas y guardadas por el servidor. Arranca en `null` y queda en `null` si el
 * servidor no responde (la pantalla usa entonces lo guardado en el dispositivo). Se piden de nuevo cuando termina una
 * partida o se guarda el puntaje, y al iniciar o cerrar sesión, porque pasan a ser las de la cuenta.
 */
export function useEstadisticasServidor(): EstadisticasServidor | null {
  const [estadisticas, setEstadisticas] = useState<EstadisticasServidor | null>(null);
  const { sesion, lista } = useSesion();
  const token = sesion?.token ?? null;
  const ultimoPedido = useRef(0);

  useEffect(() => {
    if (!lista || esModoDemo()) return;
    let activo = true;

    const traer = () => {
      const numero = ++ultimoPedido.current;
      pedirEstadisticas(idDeDispositivo())
        .then((nuevas) => {
          // Solo vale la respuesta del pedido más reciente: una más lenta y vieja no pisa a una nueva.
          if (activo && numero === ultimoPedido.current) setEstadisticas(nuevas);
        })
        .catch(() => {});
    };

    traer();
    window.addEventListener(EVENTO_HISTORIAL, traer);
    return () => {
      activo = false;
      window.removeEventListener(EVENTO_HISTORIAL, traer);
    };
    // Al cambiar la sesión (token) el efecto se repite y vuelve a pedir.
  }, [lista, token]);

  return estadisticas;
}
