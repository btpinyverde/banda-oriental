// Un wav de una fracción de segundo en silencio: sirve para "desbloquear" el <audio> con un toque de la persona.
const SILENCIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Los navegadores (sobre todo el del iPhone) solo dejan sonar un <audio> si una persona lo tocó antes. Se lo "desbloquea"
 * con un sonido en silencio dentro de un toque que la persona ya iba a hacer (entrar a la sala, empezar); después las
 * rondas pueden sonar solas. Llamar dentro del manejador del toque, antes de cualquier espera.
 */
export function desbloquearAudio(elemento: HTMLAudioElement | null): void {
  if (!elemento) return;
  try {
    elemento.dataset.url = ""; // para que la ronda cargue su canción de verdad
    elemento.src = SILENCIO;
    Promise.resolve(elemento.play())
      .then(() => elemento.pause())
      .catch(() => {});
  } catch {
    // Sin audio disponible: no hay nada que desbloquear.
  }
}
