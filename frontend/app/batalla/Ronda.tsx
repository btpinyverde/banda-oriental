"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ApiBatallas, EstadoSala } from "../lib/batallas/api-batallas";
import type { CancionCatalogo } from "../lib/juego/tipos";
import { BuscadorCanciones } from "../jugar/BuscadorCanciones";

interface Props {
  sala: EstadoSala;
  ahora: () => number;
  api: ApiBatallas;
  audio: RefObject<HTMLAudioElement | null>;
  canciones: CancionCatalogo[];
  refrescar: () => void;
}

const faltan = (iso: string, ahoraMs: number) => Math.max(0, Math.ceil((Date.parse(iso) - ahoraMs) / 1000));

/**
 * Una ronda. El jugador oye la canción y la busca; quien organiza no oye ni busca, solo ve cuántos respondieron. Lo que
 * marca cuándo abre y cierra la ronda es la hora del servidor (`ahora()`), no la de este dispositivo.
 */
export function Ronda({ sala, ahora, api, audio, canciones, refrescar }: Props) {
  const ronda = sala.round;
  const organiza = sala.role === "host";
  const modoAnfitrion = sala.audio_mode === "host";
  // La música suena en este dispositivo si es el del anfitrión (modo anfitrión) o el de un jugador (cada uno con el suyo).
  const suena = organiza ? modoAnfitrion : !modoAnfitrion;
  const [, setLatido] = useState(0);
  const [enviadaEn, setEnviadaEn] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [necesitaToque, setNecesitaToque] = useState(false);
  const avisoDeCierre = useRef<number | null>(null);

  // Repinta cada cuarto de segundo para que la cuenta regresiva y el cierre de la ronda no dependan de la próxima consulta.
  useEffect(() => {
    const id = setInterval(() => setLatido((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  const ahoraMs = ahora();
  const empezo = !!ronda && ahoraMs >= Date.parse(ronda.starts_at);
  const termino = !!ronda && ahoraMs >= Date.parse(ronda.ends_at);
  const url = ronda?.preview_url ?? null;
  const indice = ronda?.index ?? -1;

  // Va cargando el audio de la ronda (la que viene o la actual) para que suene apenas abra.
  useEffect(() => {
    const el = audio.current;
    if (!el || !suena || !url || el.dataset.url === url) return;
    el.dataset.url = url;
    el.src = url;
    el.load();
  }, [audio, suena, url]);

  // Suena apenas abre la ronda y se corta cuando cierra.
  useEffect(() => {
    const el = audio.current;
    if (!el || !suena || !url) return;
    if (empezo && !termino) {
      setNecesitaToque(false);
      Promise.resolve(el.play()).catch(() => setNecesitaToque(true));
    } else if (termino) {
      el.pause();
    }
  }, [audio, suena, url, indice, empezo, termino]);

  // Cuando se cumple el tiempo, no espera a la consulta de turno: pide el estado ya (una vez por ronda).
  useEffect(() => {
    if (termino && avisoDeCierre.current !== indice) {
      avisoDeCierre.current = indice;
      refrescar();
    }
  }, [termino, indice, refrescar]);

  if (!ronda) return null;
  const yaRespondio = !!ronda.answered || enviadaEn === ronda.index;

  async function enviar(cancion: CancionCatalogo) {
    setError(null);
    setEnviando(true);
    try {
      await api.responder(sala.code, cancion.id);
      setEnviadaEn(ronda!.index);
      refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos enviar tu respuesta.");
    } finally {
      setEnviando(false);
    }
  }

  const respondieron = sala.players.filter((j) => j.answered).length;

  return (
    <section className="batalla__tarjeta">
      <p className="batalla__ronda">
        Ronda {ronda.index + 1} de {sala.round_count}
      </p>

      {!empezo && (
        <>
          <p className="batalla__bajada">Se viene la canción…</p>
          <p className="batalla__cuenta" aria-live="polite">
            {faltan(ronda.starts_at, ahoraMs)}
          </p>
        </>
      )}

      {empezo && !termino && (
        <>
          <p className="batalla__tiempo">{faltan(ronda.ends_at, ahoraMs)} s</p>
          {suena && necesitaToque && (
            <button type="button" className="boton boton--violeta" onClick={() => audio.current && Promise.resolve(audio.current.play()).then(() => setNecesitaToque(false)).catch(() => {})}>
              Tocá para escuchar
            </button>
          )}
          {organiza ? (
            <>
              {modoAnfitrion && <p className="batalla__bajada">Está sonando la canción en tu pantalla.</p>}
              <p className="batalla__bajada">
                Respondieron {respondieron} de {sala.players.length}
              </p>
            </>
          ) : yaRespondio ? (
            <p className="batalla__bajada">Respuesta enviada. Esperá a que termine la ronda.</p>
          ) : (
            <>
              {modoAnfitrion && <p className="batalla__bajada">Escuchá la canción en la pantalla del anfitrión.</p>}
              <BuscadorCanciones canciones={canciones} puedeEnviar={!enviando} enviando={enviando} alEnviar={enviar} />
              {error && (
                <p className="batalla__error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </>
      )}

      {termino && <p className="batalla__bajada">Se acabó el tiempo. Mirando los resultados…</p>}
    </section>
  );
}
