"use client";

import { useEffect, useRef, useState } from "react";
import { cargarYoutube, type ApiYoutube, type JugadorYoutube } from "../lib/batallas/youtube-iframe";

interface Props {
  videoId: string;
  /** Segundo del video desde el que suena. */
  inicio: number;
  /** Verdadero mientras la ronda está abierta: ahí suena; antes y después queda quieto. */
  activo: boolean;
  /** El video no se puede oír (no existe, el dueño no deja embeberlo, no cargó): quien lo usa pasa al audio de reserva. */
  alFallar: () => void;
  cargar?: () => Promise<ApiYoutube>;
}

const ESPERA_DEL_TOQUE_MS = 3500;

/**
 * El video de YouTube de una ronda, en su reproductor embebido (visible, de 200×200). Se va cargando antes de que abra la
 * ronda; al abrirse suena desde `inicio` y al cerrarse se pausa. Si el navegador no lo deja sonar solo (el iPhone, sobre todo)
 * muestra un botón para tocar.
 */
export function ReproductorYoutube({ videoId, inicio, activo, alFallar, cargar = cargarYoutube }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const jugador = useRef<JugadorYoutube | null>(null);
  const [listo, setListo] = useState(false);
  const [pideToque, setPideToque] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Para que cambiar estas funciones no recree el reproductor: lo que lo identifica es el video.
  const falla = useRef(alFallar);
  falla.current = alFallar;
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    let vivo = true;
    setListo(false);
    setPideToque(false);
    cargarRef
      .current()
      .then((YT) => {
        if (!vivo || !contenedor.current) return;
        const destino = document.createElement("div"); // la API reemplaza el elemento por el iframe: se le da uno propio
        contenedor.current.appendChild(destino);
        jugador.current = new YT.Player(destino, {
          width: 200,
          height: 200,
          videoId,
          playerVars: { start: inicio, playsinline: 1, controls: 0, rel: 0, modestbranding: 1 },
          events: {
            onReady: () => vivo && setListo(true),
            onError: () => vivo && falla.current(),
            onStateChange: (evento) => {
              if (evento.data === 1) {
                clearTimeout(espera.current);
                setPideToque(false);
              }
            },
          },
        });
      })
      .catch(() => vivo && falla.current());
    return () => {
      vivo = false;
      clearTimeout(espera.current);
      try {
        jugador.current?.destroy();
      } catch {
        // Ya no existía.
      }
      jugador.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, inicio]);

  useEffect(() => {
    const el = jugador.current;
    if (!listo || !el) return;
    if (activo) {
      el.seekTo(inicio, true);
      el.playVideo();
      clearTimeout(espera.current);
      espera.current = setTimeout(() => {
        const estado = jugador.current?.getPlayerState();
        if (estado !== 1 && estado !== 3) setPideToque(true); // ni suena ni está cargando: el navegador no lo dejó
      }, ESPERA_DEL_TOQUE_MS);
    } else {
      clearTimeout(espera.current);
      el.pauseVideo();
    }
  }, [listo, activo, inicio]);

  return (
    <div className="batalla__video">
      <div ref={contenedor} className="batalla__video-marco" />
      {pideToque && activo && (
        <button
          type="button"
          className="boton boton--violeta"
          onClick={() => {
            jugador.current?.seekTo(inicio, true);
            jugador.current?.playVideo();
            setPideToque(false);
          }}
        >
          Tocá para escuchar
        </button>
      )}
    </div>
  );
}
