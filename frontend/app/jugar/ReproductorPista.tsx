"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mezcla, type Pista } from "../lib/juego/mezcla";
import { ondaProvisoria } from "../lib/juego/onda";

type Estado = "inactivo" | "cargando" | "sonando" | "pausado" | "error";

const ESPERA_MAXIMA_MS = 15000;
const REVISAR_CADA_MS = 50;
const BARRAS = 64;
// Cuánto tiene que avanzar el reloj del audio para dar por hecho que está sonando de verdad.
const AVANCE_MINIMO_S = 0.05;

function formatoTiempo(segundos: number): string {
  if (!Number.isFinite(segundos)) return "0:00";
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
}

function crearContexto(): AudioContext | null {
  const Constructor =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Constructor ? new Constructor() : null;
}

interface Props {
  /** Todas las pistas desbloqueadas: suenan juntas. */
  pistas: Pista[];
  /**
   * Avisa si ya se puede responder. Solo pasa a `true` cuando el audio sonó de verdad (el reloj del audio avanzó):
   * tocar play o terminar de cargar no alcanza. Un error o una espera de carga vuelven a bloquear.
   */
  alCambiarListo: (listo: boolean) => void;
  /**
   * Avisa que las pistas no se pudieron bajar o reproducir (error, el navegador lo rechazó o no empezó en 15
   * segundos). Sirve para pedir direcciones nuevas: las del audio están firmadas y vencen.
   */
  alFallar?: () => void;
  /** Velocidad de cada descarga (bytes por segundo), para elegir la calidad de las siguientes pistas. */
  alMedir?: (bytesPorSegundo: number) => void;
}

/** Cada conjunto de pistas (día e intento) tiene su propio reproductor: al cambiar las direcciones se reinicia todo. */
export function ReproductorPista(props: Props) {
  return <Reproduccion key={props.pistas.map((pista) => pista.url).join("|")} {...props} />;
}

function Reproduccion({ pistas, alCambiarListo, alFallar, alMedir }: Props) {
  const mezcla = useRef<Mezcla | null>(null);
  const contexto = useRef<AudioContext | null>(null);
  const carga = useRef<Promise<void> | null>(null);
  const escuchado = useRef(false);
  const montado = useRef(true);
  const avisar = useRef(alCambiarListo);
  avisar.current = alCambiarListo;
  const fallar = useRef(alFallar);
  fallar.current = alFallar;
  const pistasActuales = useRef(pistas);
  pistasActuales.current = pistas;

  const [estado, setEstado] = useState<Estado>("inactivo");
  const [sinSoporte, setSinSoporte] = useState(false);
  const [posicion, setPosicion] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [picos, setPicos] = useState<number[] | null>(null);
  const provisoria = useMemo(() => ondaProvisoria(BARRAS), []);

  function fallo() {
    if (!montado.current) return;
    mezcla.current?.detener();
    escuchado.current = false;
    setEstado("error");
    avisar.current(false);
    fallar.current?.();
  }

  function cargar(): Promise<void> {
    const actual = mezcla.current;
    if (!actual) return Promise.reject(new Error("Sin audio"));
    const lectura = actual.cargar(pistasActuales.current).then(() => {
      if (!montado.current) return;
      setDuracion(actual.duracion);
      setPicos(actual.picos(BARRAS));
    });
    carga.current = lectura;
    return lectura;
  }

  // Al montar: se prepara el audio y se leen todas las pistas, para que el play responda al instante y la onda
  // sea la del audio real.
  useEffect(() => {
    montado.current = true;
    avisar.current(false);
    const nuevo = crearContexto();
    if (!nuevo) {
      setSinSoporte(true);
      setEstado("error");
      return;
    }
    contexto.current = nuevo;
    mezcla.current = new Mezcla(nuevo, alMedir);
    cargar().catch(fallo);
    return () => {
      montado.current = false;
      mezcla.current?.detener();
      void contexto.current?.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espera máxima mientras se carga o se arranca.
  useEffect(() => {
    if (estado !== "cargando") return;
    const temporizador = window.setTimeout(fallo, ESPERA_MAXIMA_MS);
    return () => window.clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Mientras suena: sigue el reloj del audio para la posición, para saber que de verdad arrancó y para detectar el final.
  useEffect(() => {
    if (estado !== "cargando" && estado !== "sonando") return;
    const intervalo = window.setInterval(() => {
      const actual = mezcla.current;
      if (!actual?.sonando) return;
      if (actual.terminada()) {
        actual.detener();
        setPosicion(0);
        setEstado("inactivo");
        avisar.current(escuchado.current);
        return;
      }
      const segundo = actual.posicion();
      setPosicion(segundo);
      if (!escuchado.current && segundo >= AVANCE_MINIMO_S) {
        escuchado.current = true;
        setEstado("sonando");
        avisar.current(true);
      }
    }, REVISAR_CADA_MS);
    return () => window.clearInterval(intervalo);
  }, [estado]);

  async function alternar() {
    const actual = mezcla.current;
    if (!actual || estado === "cargando") return;
    if (estado === "sonando") {
      actual.pausar();
      setEstado("pausado");
      avisar.current(escuchado.current);
      return;
    }
    setEstado("cargando");
    avisar.current(false);
    try {
      if (estado === "error") await cargar();
      else await carga.current;
      if (!montado.current) return;
      // En iPhone el audio de Web Audio se calla con el botón de silencio; así se pide que suene igual.
      const sesion = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (sesion) sesion.type = "playback";
      await contexto.current?.resume();
      if (!montado.current) return;
      actual.iniciar(actual.posicion());
    } catch {
      fallo();
    }
  }

  const progreso = duracion ? Math.min(100, (posicion / duracion) * 100) : 0;
  const leyendo = !picos && estado !== "error";
  const alturas = picos ?? provisoria;
  const mensaje = sinSoporte
    ? "Tu navegador no puede reproducir el audio."
    : estado === "error"
      ? "No se pudo reproducir el audio. Tocá para reintentar."
      : estado === "cargando"
        ? "Cargando audio…"
        : escuchado.current
          ? "Ya podés responder."
          : "Escuchá la pista para poder responder.";

  return (
    <section className="reproductor" aria-label="Pista de audio">
      <button
        type="button"
        className="reproductor__boton"
        onClick={alternar}
        disabled={estado === "cargando" || sinSoporte}
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

      <div className={`reproductor__onda${leyendo ? " reproductor__onda--cargando" : ""}`} aria-hidden="true">
        {alturas.map((altura, i) => (
          <span
            key={i}
            className={`onda__barra${picos ? "" : " onda__barra--provisoria"}${(i / BARRAS) * 100 < progreso ? " onda__barra--hecha" : ""}`}
            style={{ height: `${altura * 100}%`, animationDelay: leyendo ? `${(i % 16) * 60}ms` : undefined }}
          />
        ))}
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
