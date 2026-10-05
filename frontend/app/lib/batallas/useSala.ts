"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../juego/tipos";
import { crearApiBatallas, leerHostToken, type ApiBatallas, type EstadoSala, type NombreDeFase, type SalaUnible } from "./api-batallas";

// Cada cuánto se consulta según lo que pasa en la sala (docs/contrato-api-batallas.md): más seguido cerca de un cambio.
const INTERVALO_MS: Record<NombreDeFase | "otro", number> = {
  lobby: 3000,
  countdown: 1500,
  playing: 2000,
  reveal: 3000,
  finished: 3000,
  otro: 3000,
};

/**
 * La sala de una batalla, consultada cada pocos segundos. El dispositivo no se conecta a nada permanente: pregunta, y el
 * servidor contesta el estado (o "sin cambios"). Con la hora del servidor de cada respuesta se estima el desfase del
 * reloj, así `ahora()` marca el mismo instante en todos los dispositivos aunque tengan la hora mal.
 *
 * `apiExterna` (para los tests) tiene que ser siempre el mismo objeto: si cambia en cada render, la consulta se reinicia.
 */
export function useSala(code: string, apiExterna?: ApiBatallas) {
  // Un solo cliente por pantalla: si se creara uno nuevo en cada render, la consulta se reiniciaría sin parar.
  const api = useMemo(() => apiExterna ?? crearApiBatallas(), [apiExterna]);
  const [sala, setSala] = useState<EstadoSala | SalaUnible | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const desfase = useRef(0);
  const mejorRetardo = useRef(Infinity);
  const consultarRef = useRef<() => void>(() => {});

  useEffect(() => {
    let vivo = true;
    let terminada = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let clave = "";
    let fase: NombreDeFase | "otro" = "otro";
    const hostToken = leerHostToken(code) ?? undefined;

    const programar = () => {
      if (!vivo || terminada) return;
      clearTimeout(temporizador);
      temporizador = setTimeout(consultar, INTERVALO_MS[fase]);
    };

    async function consultar() {
      clearTimeout(temporizador);
      if (!vivo) return;
      if (typeof document !== "undefined" && document.hidden) return programar(); // con la pestaña oculta no se gasta ni batería ni cuota
      const antes = Date.now();
      try {
        const r = await api.estado(code, { since: clave || undefined, hostToken });
        if (!vivo) return;
        const despues = Date.now();
        const retardo = (despues - antes) / 2; // lo que tardó la ida, suponiendo que ida y vuelta duran lo mismo
        const delServidor = Date.parse(r.server_time);
        // Una respuesta sin hora válida no puede arruinar el reloj: se la ignora y se espera a la próxima.
        if (Number.isFinite(delServidor) && retardo <= mejorRetardo.current) {
          mejorRetardo.current = retardo;
          desfase.current = delServidor + retardo - despues;
        }
        setError(null);
        if ("joinable" in r) {
          clave = "";
          fase = "otro";
          setSala(r);
        } else if (r.changed) {
          clave = r.key;
          fase = r.phase.name;
          setSala(r);
          if (r.status === "finished") terminada = true; // ya no cambia: no hace falta seguir preguntando
        }
      } catch (e) {
        if (!vivo) return;
        setError(e instanceof Error ? e : new Error("Error inesperado."));
      }
      programar();
    }

    consultarRef.current = () => {
      terminada = false;
      consultar();
    };
    const alVolver = () => {
      if (!document.hidden && !terminada) consultar();
    };
    document.addEventListener("visibilitychange", alVolver);
    consultar();
    return () => {
      vivo = false;
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [code, api]);

  const ahora = useCallback(() => Date.now() + desfase.current, []);
  const refrescar = useCallback(() => consultarRef.current(), []);
  return { sala, error, ahora, refrescar };
}
