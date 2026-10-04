import type { TipoStem } from "../juego/tipos";

const SEGUNDOS = 3;

/**
 * Hace sonar las pistas de la canción de práctica, sintetizadas en el momento (así el tutorial no necesita bajar
 * audios): batería = golpes graves, bajo = notas graves, otros = un acorde, voz = una nota con vibrato.
 * Si el navegador no tiene Web Audio no hace nada: el tutorial se entiende igual.
 */
export function sonarPistas(tipos: TipoStem[]): void {
  const Contexto = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Contexto) return;
  const contexto = new Contexto();
  const salida = contexto.createGain();
  salida.gain.value = 0.5 / Math.max(1, tipos.length);
  salida.connect(contexto.destination);
  const inicio = contexto.currentTime + 0.05;

  const nota = (tipo: OscillatorType, frecuencia: number, desde: number, duracion: number, volumen: number) => {
    const oscilador = contexto.createOscillator();
    const ganancia = contexto.createGain();
    oscilador.type = tipo;
    oscilador.frequency.setValueAtTime(frecuencia, inicio + desde);
    ganancia.gain.setValueAtTime(volumen, inicio + desde);
    ganancia.gain.exponentialRampToValueAtTime(0.001, inicio + desde + duracion);
    oscilador.connect(ganancia).connect(salida);
    oscilador.start(inicio + desde);
    oscilador.stop(inicio + desde + duracion);
    return oscilador;
  };

  for (let tiempo = 0; tiempo < SEGUNDOS; tiempo += 0.5) {
    if (tipos.includes("drums")) {
      const bombo = nota("sine", 150, tiempo, 0.25, 1);
      bombo.frequency.exponentialRampToValueAtTime(40, inicio + tiempo + 0.2);
    }
    if (tipos.includes("bass")) nota("sawtooth", tiempo % 1 === 0 ? 55 : 82.4, tiempo, 0.45, 0.5);
    if (tipos.includes("other") && tiempo % 1 === 0) for (const f of [220, 277.2, 329.6]) nota("triangle", f, tiempo, 0.95, 0.25);
    if (tipos.includes("vocals") && tiempo % 1 === 0) {
      const voz = nota("sine", tiempo % 2 === 0 ? 440 : 392, tiempo, 0.95, 0.5);
      const vibrato = contexto.createOscillator();
      const profundidad = contexto.createGain();
      vibrato.frequency.value = 5.5;
      profundidad.gain.value = 6;
      vibrato.connect(profundidad).connect(voz.frequency);
      vibrato.start(inicio + tiempo);
      vibrato.stop(inicio + tiempo + 0.95);
    }
  }
  window.setTimeout(() => void contexto.close().catch(() => {}), (SEGUNDOS + 1) * 1000);
}
