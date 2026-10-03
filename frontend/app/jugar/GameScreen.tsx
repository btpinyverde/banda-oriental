// frontend/app/jugar/GameScreen.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceId } from "../lib/device-id";
import { ApiError, getDailyState, listSongs, submitGuess } from "../lib/api";
import type { DailyState, SongOption } from "../lib/api";
import { AudioPlayer } from "../ui/AudioPlayer";
import { SongSearch } from "../ui/SongSearch";
import { AttemptsTable } from "../ui/AttemptsTable";

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "no-song-today" }
  | { status: "ready"; daily: DailyState; songs: SongOption[] };

const MAX_ATTEMPTS = 6;

export function GameScreen() {
  const [screen, setScreen] = useState<ScreenState>({ status: "loading" });
  const [canGuess, setCanGuess] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [syncRequired, setSyncRequired] = useState(false);
  const [audioEpoch, setAudioEpoch] = useState(0);
  const requestId = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setCanGuess(false);
    setScreen({ status: "loading" });
    const deviceId = getDeviceId();
    try {
      const daily = await getDailyState(deviceId);
      if (id !== requestId.current) return;
      if (daily === null) {
        setScreen({ status: "no-song-today" });
        return;
      }
      const songs = daily.finished ? [] : await listSongs();
      if (id !== requestId.current) return;
      setScreen({ status: "ready", daily, songs });
    } catch (error) {
      if (id !== requestId.current) return;
      const message =
        error instanceof ApiError ? error.message : "No pudimos conectarnos. Probá de nuevo.";
      setScreen({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  async function reconcile() {
    if (screen.status !== "ready") return;
    const daily = await getDailyState(getDeviceId());
    if (!daily) {
      setScreen({ status: "no-song-today" });
    } else {
      const previous = screen.daily;
      if (daily.finished || previous.finished || daily.day !== previous.day ||
          daily.attempt_number !== previous.attempt_number) setSelectedSong(null);
      setScreen({ status: "ready", daily, songs: screen.songs });
    }
    setCanGuess(false);
    setAudioEpoch((value) => value + 1);
    setSyncRequired(false);
    setSubmitError("");
  }

  async function refreshAfterError() {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      await reconcile();
    } catch {
      setSubmitError("No pudimos actualizar la partida. Tu respuesta se conserva; volvé a actualizar.");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (busy.current || syncRequired || screen.status !== "ready" ||
        screen.daily.finished || !selectedSong || !canGuess) return;
    busy.current = true;
    setSubmitting(true);
    setCanGuess(false);
    setSubmitError("");
    try {
      await submitGuess(getDeviceId(), screen.daily.attempt_number, selectedSong.id);
      await reconcile();
    } catch (error) {
      // A lost response does not tell us whether the server saved the guess.
      // Reconcile with GET before offering another POST.
      setSyncRequired(true);
      setSubmitError(error instanceof ApiError ? error.message :
        "Se interrumpió la conexión. Actualizá la partida para comprobar tu intento.");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  if (screen.status === "loading") {
    return <p role="status">Cargando el juego de hoy…</p>;
  }

  if (screen.status === "error") {
    return (
      <div className="game-screen__error">
        <p>{screen.message}</p>
        <button type="button" onClick={load}>
          Reintentar
        </button>
      </div>
    );
  }

  if (screen.status === "no-song-today") {
    return <p>Todavía no hay canción publicada para hoy. Volvé más tarde.</p>;
  }

  const { daily, songs } = screen;

  if (daily.finished) {
    return (
      <section className="game-screen__result" aria-live="polite">
        <h1>{daily.won ? "¡La adivinaste!" : "Se terminaron los intentos"}</h1>
        <p>
          Era <strong>{daily.song.title}</strong>, de {daily.song.artist}.
        </p>
      </section>
    );
  }

  const currentStem = [...daily.unlocked_stems].sort((a, b) => b.unlock_order - a.unlock_order)[0];
  const attemptKey = `${daily.day}:${daily.attempt_number}`;

  return (
    <section className="game-screen">
      <p className="game-screen__eyebrow">Banda Oriental · Desafío diario</p>
      <h1>¿Qué canción es?</h1>
      <p>Intento {daily.attempt_number} de {MAX_ATTEMPTS} · Adiviná la canción uruguaya.</p>
      {currentStem && (
        <AudioPlayer
          key={`${attemptKey}:${audioEpoch}`}
          src={currentStem.url}
          unlockedCount={daily.unlocked_stems.length}
          onReady={setCanGuess}
        />
      )}
      {!currentStem && <p role="alert">La pista no está disponible. No se gastará ningún intento. <button onClick={load}>Actualizar</button></p>}
      <AttemptsTable attempts={daily.feedback_history} maxAttempts={MAX_ATTEMPTS} />
      <SongSearch key={attemptKey} songs={songs} onSelect={setSelectedSong} disabled={submitting || syncRequired} />
      <button
        type="button"
        disabled={!selectedSong || !currentStem || !canGuess || submitting || syncRequired}
        onClick={handleSubmit}
      >
        {submitting ? "Actualizando…" : "Enviar intento"}
      </button>
      {submitError && <p role="alert">{submitError}</p>}
      {syncRequired && <button disabled={submitting} onClick={refreshAfterError}>Actualizar partida</button>}
      <p className="game-screen__hint">
        {canGuess
          ? selectedSong
            ? `Vas a responder: ${selectedSong.title}`
            : "Elegí una canción de la lista."
          : "Escuchá la pista antes de responder."}
      </p>
    </section>
  );
}
