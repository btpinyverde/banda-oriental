"use client";

import { useEffect, useRef, useState } from "react";
import { picosDeOnda } from "../lib/juego/onda";

type Estado = "inactivo" | "cargando" | "sonando" | "pausado" | "error";

const ESPERA_MAXIMA_MS = 15000;
const BARRAS = 64;

function formatoTiempo(segundos: number): string {
  if (!Number.isFinite(segundos)) return "0:00";
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
}

interface Props {
  src: string;
  /**
   * Avisa si ya se puede responder. Solo pasa a `true` cuando el audio sonó de verdad (evento `playing`):
   * tocar play o cargar los metadatos no alcanza. Un error o una espera de carga vuelven a bloquear.
   */
  alCambiarListo: (listo: boolean) => void;
  /**
   * Avisa que el audio no se pudo reproducir (error, el navegador lo rechazó o no empezó en 15 segundos). Sirve
   * para pedir direcciones nuevas: las del audio están firmadas y vencen.
   */
  alFallar?: () => void;
}

/** Cada pista (día e intento) tiene su propio reproductor: al cambiar `src` se reinicia todo. */
export function ReproductorPista(props: Props) {
  return <Reproduccion key={props.src} {...props} />;
}

function Reproduccion({ src, alCambiarListo, alFallar }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const escuchado = useRef(false);
  const montado = useRef(true);
  const avisar = useRef(alCambiarListo);
  avisar.current = alCambiarListo;
  const fallar = useRef(alFallar);
  fallar.current = alFallar;

  const [estado, setEstado] = useState<Estado>("inactivo");
  const [posicion, setPosicion] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [picos, setPicos] = useState<number[] | null>(null);

  // La onda sale del audio real. Si el navegador no puede decodificarlo (otro dominio sin CORS, por
  // ejemplo), queda la onda de adorno: el reproductor funciona igual.
  useEffect(() => {
    if (typeof AudioContext === "undefined" || typeof fetch === "undefined") return;
    let cancelado = false;
    const contexto = new AudioContext();
    fetch(src)
      .then((respuesta) => respuesta.arrayBuffer())
      .then((datos) => contexto.decodeAudioData(datos))
      .then((audioDecodificado) => {
        if (!cancelado) setPicos(picosDeOnda(audioDecodificado.getChannelData(0), BARRAS));
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      void contexto.close?.();
    };
  }, [src]);

  useEffect(() => {
    montado.current = true;
    avisar.current(false);
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (estado !== "cargando") return;
    const temporizador = window.setTimeout(() => {
      escuchado.current = false;
      audio.current?.pause();
      setEstado("error");
      avisar.current(false);
      fallar.current?.();
    }, ESPERA_MAXIMA_MS);
    return () => window.clearTimeout(temporizador);
  }, [estado]);

  async function alternar() {
    const elemento = audio.current;
    if (!elemento || estado === "cargando") return;
    if (estado === "sonando") {
      elemento.pause();
      return;
    }
    setEstado("cargando");
    avisar.current(false);
    try {
      if (estado === "error") elemento.load();
      await elemento.play();
    } catch {
      if (!montado.current) return;
      escuchado.current = false;
      setEstado("error");
      avisar.current(false);
      fallar.current?.();
    }
  }

  const progreso = duracion ? Math.min(100, (posicion / duracion) * 100) : 0;
  const mensaje =
    estado === "error"
      ? "No se pudo reproducir el audio. Tocá para reintentar."
      : estado === "cargando"
        ? "Cargando audio…"
        : escuchado.current
          ? "Ya podés responder."
          : "Escuchá la pista para poder responder.";

  return (
    <section className="reproductor" aria-label="Pista de audio">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuracion(e.currentTarget.duration)}
        onPlaying={() => {
          escuchado.current = true;
          setEstado("sonando");
          avisar.current(true);
        }}
        onWaiting={() => {
          escuchado.current = false;
          setEstado("cargando");
          avisar.current(false);
        }}
        onPause={() => {
          setEstado((actual) => (actual === "error" ? "error" : "pausado"));
          avisar.current(escuchado.current);
        }}
        onEnded={() => {
          setEstado("inactivo");
          setPosicion(0);
          avisar.current(escuchado.current);
        }}
        onError={() => {
          escuchado.current = false;
          setEstado("error");
          avisar.current(false);
          fallar.current?.();
        }}
        onTimeUpdate={(e) => setPosicion(e.currentTarget.currentTime)}
      />

      <button
        type="button"
        className="reproductor__boton"
        onClick={alternar}
        disabled={estado === "cargando"}
        aria-label={estado === "sonando" ? "Pausar audio" : estado === "error" ? "Reintentar audio" : "Reproducir audio"}
      >
        {estado === "sonando" ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
            <rect x="3" y="2" width="4" height="14" rx="1.5" />
            <rect x="11" y="2" width="4" height="14" rx="1.5" />
          </svg>
        ) : estado === "error" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4" />
          </svg>
        ) : (
          <svg width="18" height="20" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
            <path d="M1 1.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 1 1.5Z" />
          </svg>
        )}
      </button>

      <div className="reproductor__onda" aria-hidden="true">
        {picos ? (
          picos.map((pico, i) => (
            <span
              key={i}
              className={`onda__barra${(i / BARRAS) * 100 < progreso ? " onda__barra--hecha" : ""}`}
              style={{ height: `${pico * 100}%` }}
            />
          ))
        ) : (
          <>
            <img className="reproductor__onda-base" src="/assets/hero-waveform.svg" alt="" />
            <img
              className="reproductor__onda-avance"
              src="/assets/hero-waveform.svg"
              alt=""
              style={{ clipPath: `inset(0 ${100 - progreso}% 0 0)` }}
            />
          </>
        )}
      </div>

      <span className="reproductor__tiempo">
        {formatoTiempo(posicion)} / {formatoTiempo(duracion)}
      </span>

      <p className={`reproductor__estado${estado === "error" ? "" : " solo-lectores"}`} role="status">
        {mensaje}
      </p>
    </section>
  );
}
