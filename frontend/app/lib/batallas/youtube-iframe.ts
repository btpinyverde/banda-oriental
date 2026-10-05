/**
 * El reproductor embebido de YouTube (IFrame API). Es el único camino permitido para oír un video de YouTube en una página
 * propia: el reproductor tiene que quedar visible (200×200 como mínimo), puede mostrar anuncios (no con YouTube Premium) y en
 * el celular puede pedir un toque para empezar.
 */
export interface JugadorYoutube {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(segundos: number, permitirBuscar: boolean): void;
  getPlayerState(): number;
  destroy(): void;
}

export interface ApiYoutube {
  Player: new (
    elemento: HTMLElement,
    opciones: {
      width: number;
      height: number;
      videoId: string;
      playerVars: Record<string, number>;
      events: { onReady?: () => void; onError?: (evento: { data: number }) => void; onStateChange?: (evento: { data: number }) => void };
    },
  ) => JugadorYoutube;
}

declare global {
  interface Window {
    YT?: ApiYoutube;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let promesa: Promise<ApiYoutube> | null = null;

/** Carga el script de YouTube una sola vez y devuelve su API (rechaza si no se puede cargar). */
export function cargarYoutube(): Promise<ApiYoutube> {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador."));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!promesa) {
    promesa = new Promise<ApiYoutube>((resolver, rechazar) => {
      const previa = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previa?.();
        if (window.YT) resolver(window.YT);
        else rechazar(new Error("YouTube no respondió."));
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        promesa = null; // la próxima ronda lo vuelve a intentar
        rechazar(new Error("No se pudo cargar el reproductor de YouTube."));
      };
      document.head.appendChild(script);
    });
  }
  return promesa;
}

// Códigos de error del reproductor que significan "este video no se va a poder oír acá": no existe, no se puede embeber, etc.
export const ERRORES_DE_VIDEO = new Set([2, 5, 100, 101, 150]);
