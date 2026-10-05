"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { crearApiBatallas, leerHostToken, type ApiBatallas, type EstadoSala, type SalaUnible } from "../lib/batallas/api-batallas";
import { desbloquearAudio } from "../lib/batallas/audio";
import { useSala } from "../lib/batallas/useSala";
import { crearClienteHttp } from "../lib/juego/cliente-http";
import { ApiError, type CancionCatalogo } from "../lib/juego/tipos";
import { Lobby } from "./Lobby";
import { Resultados } from "./Resultados";
import { Ronda } from "./Ronda";

interface Props {
  code: string;
  api?: ApiBatallas;
  /** Para los tests: de dónde sale el catálogo con el que se busca la canción. */
  cargarCanciones?: () => Promise<CancionCatalogo[]>;
}

/**
 * La sala de una batalla: según lo que dice el servidor muestra el formulario para entrar, el lobby, la ronda o los
 * resultados. Todo sale de consultar el estado cada pocos segundos (sin conexiones permanentes).
 */
export function Sala({ code, api, cargarCanciones = () => crearClienteHttp().listarCanciones() }: Props) {
  const cliente = useMemo(() => api ?? crearApiBatallas(), [api]);
  const { sala, error, ahora, refrescar } = useSala(code, cliente);
  // Un solo <audio> para todas las rondas: el navegador (sobre todo el iPhone) lo desbloquea con un toque y después lo deja sonar.
  const audio = useRef<HTMLAudioElement>(null);
  const [canciones, setCanciones] = useState<CancionCatalogo[]>([]);
  const esJugador = !!sala && !("joinable" in sala) && sala.role === "player";

  useEffect(() => {
    if (!esJugador || canciones.length > 0) return;
    let activo = true;
    cargarCanciones()
      .then((lista) => activo && setCanciones(lista))
      .catch(() => {});
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esJugador]);

  const hostToken = leerHostToken(code) ?? undefined;
  let contenido;
  if (!sala) {
    contenido =
      error instanceof ApiError && error.status === 404 ? (
        <Aviso titulo="No encontramos esta sala">
          <p>Puede que el enlace esté mal escrito o que la batalla ya haya empezado sin vos.</p>
        </Aviso>
      ) : error ? (
        <Aviso titulo="No pudimos conectarnos">
          <p>{error.message}</p>
          <button type="button" className="boton boton--violeta" onClick={refrescar}>
            Reintentar
          </button>
        </Aviso>
      ) : (
        <Aviso titulo="Cargando la sala…" />
      );
  } else if ("joinable" in sala) {
    contenido = <UnirseASala sala={sala} api={cliente} hostToken={hostToken} audio={audio} alEntrar={refrescar} />;
  } else if (sala.my_status === "pending") {
    contenido = (
      <Aviso titulo="Esperando que te acepten…">
        <p>Quien organiza la batalla tiene que aceptarte. No cierres esta pantalla: apenas te acepte, entrás solo.</p>
      </Aviso>
    );
  } else if (sala.my_status === "rejected") {
    contenido = (
      <Aviso titulo="No te aceptaron en esta sala">
        <p>Quien organiza la batalla no te dejó entrar.</p>
      </Aviso>
    );
  } else if (sala.status === "lobby") {
    contenido = <Lobby sala={sala} api={cliente} hostToken={hostToken} audio={audio} refrescar={refrescar} />;
  } else if (sala.phase.name === "reveal" || sala.phase.name === "finished") {
    contenido = <Resultados sala={sala} ahora={ahora} />;
  } else {
    contenido = <Ronda sala={sala as EstadoSala} ahora={ahora} api={cliente} audio={audio} canciones={canciones} refrescar={refrescar} />;
  }

  return (
    <main className="batalla">
      <audio ref={audio} preload="auto" />
      {sala && error && <p className="batalla__aviso-red">Sin conexión, reintentando…</p>}
      {contenido}
    </main>
  );
}

function Aviso({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <section className="batalla__tarjeta">
      <h1 className="batalla__titulo">{titulo}</h1>
      {children}
    </section>
  );
}

function UnirseASala({
  sala,
  api,
  hostToken,
  audio,
  alEntrar,
}: {
  sala: SalaUnible;
  api: ApiBatallas;
  hostToken?: string;
  audio: React.RefObject<HTMLAudioElement | null>;
  alEntrar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    desbloquearAudio(audio.current); // el toque de entrar deja sonar las rondas después
    setError(null);
    setEntrando(true);
    try {
      await api.unirse(sala.code, nombre, hostToken);
      alEntrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos entrar a la sala. Probá de nuevo.");
      setEntrando(false);
    }
  }

  return (
    <form className="batalla__tarjeta" onSubmit={enviar}>
      <h1 className="batalla__titulo">{sala.title || "Batalla"}</h1>
      <p className="batalla__bajada">
        {sala.round_count} canciones, {sala.round_seconds} segundos cada una. Ya hay {sala.players_count} {sala.players_count === 1 ? "persona" : "personas"} en la sala.
      </p>
      {sala.join_mode === "approval" && <p className="batalla__nota">Quien organiza tiene que aceptarte para que entres.</p>}
      <label className="batalla__campo">
        Tu nombre
        <input value={nombre} maxLength={50} onChange={(e) => setNombre(e.target.value)} autoComplete="nickname" />
      </label>
      {error && (
        <p className="batalla__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="boton boton--violeta" disabled={entrando || nombre.trim() === ""}>
        {entrando ? "Entrando…" : "Entrar a la sala"}
      </button>
    </form>
  );
}
