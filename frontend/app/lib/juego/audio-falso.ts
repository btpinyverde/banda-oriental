import { vi } from "vitest";

/**
 * Audio falso para los tests: jsdom no trae Web Audio. Cada "archivo" es una señal de muestras que `fetch` devuelve
 * y `decodeAudioData` interpreta (100 muestras por segundo, para que un puñado de números sea una duración).
 */
export const MUESTRAS_POR_SEGUNDO = 100;

export function archivoFalso(...muestras: number[]): ArrayBuffer {
  return new Float32Array(muestras).buffer;
}

export class FuenteFalsa {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

export class AudioContextFalso {
  static instancias: AudioContextFalso[] = [];
  currentTime = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  destination = {};
  fuentes: FuenteFalsa[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async (datos: ArrayBuffer) => {
    const señal = new Float32Array(datos);
    return { duration: señal.length / MUESTRAS_POR_SEGUNDO, getChannelData: () => señal };
  });

  constructor() {
    AudioContextFalso.instancias.push(this);
  }

  createBufferSource() {
    const fuente = new FuenteFalsa();
    this.fuentes.push(fuente);
    return fuente;
  }

  createGain() {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }

  createDynamicsCompressor() {
    const parametro = () => ({ value: 0 });
    return {
      threshold: parametro(),
      knee: parametro(),
      ratio: parametro(),
      attack: parametro(),
      release: parametro(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
}

/** Instala el audio falso y un `fetch` que responde según la dirección. Devuelve el mock de fetch. */
export function instalarAudioFalso(archivos: Record<string, ArrayBuffer>) {
  AudioContextFalso.instancias = [];
  vi.stubGlobal("AudioContext", AudioContextFalso);
  const pedir = vi.fn(async (url: string) => {
    const datos = archivos[url];
    if (!datos) throw new TypeError("Failed to fetch");
    return { ok: true, arrayBuffer: async () => datos.slice(0) };
  });
  vi.stubGlobal("fetch", pedir);
  return pedir;
}

export const contextoActual = () => AudioContextFalso.instancias.at(-1)!;
