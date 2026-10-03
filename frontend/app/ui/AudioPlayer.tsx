// frontend/app/ui/AudioPlayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { StemInfo } from "../lib/api";
import { Icon } from "./Icon";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

const STEM_LABELS = ["Batería", "Bajo", "Otros instrumentos", "Voz"];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

interface AudioPlayerProps {
  src: string;
  stemType?: StemInfo["stem_type"];
  unlockedCount: number;
  onReady: (ready: boolean) => void;
}

export function AudioPlayer(props: AudioPlayerProps) {
  return <AudioPlayback key={props.src} {...props} />;
}

function AudioPlayback({ src, stemType, unlockedCount, onReady }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const heard = useRef(false);
  const mounted = useRef(true);
  const [state, setState] = useState<PlaybackState>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    mounted.current = true;
    onReady(false);
    return () => { mounted.current = false; };
  }, [onReady]);

  useEffect(() => {
    if (state !== "loading") return;
    const timeout = window.setTimeout(() => {
      heard.current = false;
      audioRef.current?.pause();
      setState("error");
      onReady(false);
    }, 15000);
    return () => window.clearTimeout(timeout);
  }, [state, onReady]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || state === "loading") return;
    if (state === "playing") {
      audio.pause();
      return;
    }
    setState("loading");
    onReady(false);
    try {
      if (state === "error") audio.load();
      await audio.play();
    } catch {
      if (!mounted.current) return;
      heard.current = false;
      setState("error");
      onReady(false);
    }
  }

  return (
    <section className="audio-player" aria-label="Pista de audio">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onPlaying={() => {
          heard.current = true;
          setState("playing");
          onReady(true);
        }}
        onWaiting={() => {
          heard.current = false;
          setState("loading");
          onReady(false);
        }}
        onPause={() => {
          setState((current) => (current === "error" ? "error" : "paused"));
          onReady(heard.current);
        }}
        onEnded={() => {
          setState("idle");
          setPosition(0);
          onReady(heard.current);
        }}
        onError={() => {
          heard.current = false;
          setState("error");
          onReady(false);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      />
      <button
        type="button"
        className="audio-player__toggle"
        onClick={togglePlayback}
        disabled={state === "loading"}
        aria-label={
          state === "playing"
            ? "Pausar audio"
            : state === "error"
              ? "Reintentar audio"
              : "Reproducir audio"
        }
      >
        <Icon name={state === "playing" ? "pause" : state === "error" ? "reset" : "play"} size={26} />
      </button>
      <div className="audio-player__timeline" aria-hidden="true">
        <div
          className="audio-player__progress"
          style={{ width: duration ? `${(position / duration) * 100}%` : "0%" }}
        />
      </div>
      <span className="audio-player__time">
        {formatTime(position)} / {duration ? formatTime(duration) : "—"}
      </span>
      <p className="audio-player__status" role="status">
        {state === "error"
          ? "No se pudo reproducir el audio. Tocá para reintentar."
          : state === "loading"
            ? "Cargando audio…"
            : `Pista ${unlockedCount} de 4: ${stemType ? { drums: "Batería", bass: "Bajo", other: "Otros instrumentos", vocals: "Voz" }[stemType] : STEM_LABELS[unlockedCount - 1]}`}
      </p>
    </section>
  );
}
