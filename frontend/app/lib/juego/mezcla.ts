import { calidadActual, registrarVelocidad } from "./calidad-de-audio";
import { picosDeOnda, sumarSeñales } from "./onda";

/**
 * Una pista del día. La `clave` (día + tipo) identifica el audio; las direcciones están firmadas y cambian en cada pedido.
 * `url` es la versión buena (o el original, si la pista no se convirtió); `variants` trae las versiones que existen, y la
 * liviana se usa si la conexión es lenta (se decide al bajarla).
 */
export interface Pista {
  clave: string;
  url: string;
  variants?: Partial<Record<"high" | "low", string>>;
}

// Audios ya decodificados, por clave. Cada intento desbloquea una pista más y vuelve a pedir el estado del día con
// direcciones nuevas: con esto solo se baja la pista nueva y las anteriores no se descargan otra vez.
const MINIMO_PARA_MEDIR = 50_000;

const cache = new Map<string, Promise<AudioBuffer>>();

export function vaciarCache(): void {
  cache.clear();
}

/**
 * Todas las pistas desbloqueadas sonando juntas. Usa Web Audio en vez de un elemento <audio> por pista porque así
 * arrancan en el mismo instante exacto (con elementos <audio> quedan desfasadas unas decenas de milisegundos y la
 * batería con el bajo suena "arrastrada").
 */
export class Mezcla {
  private buffers: AudioBuffer[] = [];
  private fuentes: AudioBufferSourceNode[] = [];
  private limitador: DynamicsCompressorNode | null = null;
  private inicioDelContexto = 0;
  private desde = 0;
  private reproduciendo = false;

  constructor(private readonly contexto: AudioContext) {}

  /** Duración de la mezcla: la de la pista más larga. */
  get duracion(): number {
    return Math.max(0, ...this.buffers.map((buffer) => buffer.duration));
  }

  get sonando(): boolean {
    return this.reproduciendo;
  }

  async cargar(pistas: Pista[]): Promise<void> {
    this.buffers = await Promise.all(pistas.map((pista) => this.leer(pista)));
  }

  private leer({ clave, url, variants }: Pista): Promise<AudioBuffer> {
    let carga = cache.get(clave);
    if (!carga) {
      const empezo = performance.now();
      // La calidad se elige ahora, al bajar, según la conexión de este momento.
      carga = fetch(variants?.[calidadActual()] ?? url)
        .then((respuesta) => {
          if (!respuesta.ok) throw new Error(`No se pudo bajar el audio (${respuesta.status})`);
          return respuesta.arrayBuffer();
        })
        .then((datos) => {
          this.medir(datos.byteLength, performance.now() - empezo);
          return this.contexto.decodeAudioData(datos);
        });
      cache.set(clave, carga);
      // Una carga fallida no se recuerda: el próximo intento vuelve a pedirla.
      carga.catch(() => cache.delete(clave));
    }
    return carga;
  }

  private medir(bytes: number, milisegundos: number): void {
    // Un archivo diminuto baja casi al instante en cualquier conexión: no dice nada de ella.
    if (bytes < MINIMO_PARA_MEDIR || milisegundos <= 0) return;
    registrarVelocidad((bytes * 1000) / milisegundos);
  }

  /** Alturas (de 0 a 1) de las barras de la onda de la mezcla completa. */
  picos(barras: number): number[] {
    return picosDeOnda(sumarSeñales(this.buffers.map((buffer) => buffer.getChannelData(0))), barras);
  }

  /** Segundos que lleva sonando la mezcla (sin pasar de la duración). */
  posicion(): number {
    if (!this.reproduciendo) return this.desde;
    return Math.min(this.duracion, this.desde + this.contexto.currentTime - this.inicioDelContexto);
  }

  terminada(): boolean {
    return this.reproduciendo && this.posicion() >= this.duracion;
  }

  /** Hace sonar todas las pistas a la vez desde `desde` segundos. */
  iniciar(desde: number): void {
    this.liberar();
    const salida = this.salida();
    const cuando = this.contexto.currentTime;
    this.fuentes = this.buffers.map((buffer) => {
      const fuente = this.contexto.createBufferSource();
      fuente.buffer = buffer;
      fuente.connect(salida);
      fuente.start(cuando, desde);
      return fuente;
    });
    this.inicioDelContexto = cuando;
    this.desde = desde;
    this.reproduciendo = true;
  }

  /** Frena y devuelve el segundo en el que quedó, para seguir desde ahí. */
  pausar(): number {
    const donde = this.posicion();
    this.liberar();
    this.reproduciendo = false;
    this.desde = donde;
    return donde;
  }

  /** Frena y vuelve al principio. */
  detener(): void {
    this.liberar();
    this.reproduciendo = false;
    this.desde = 0;
  }

  // Un limitador antes de la salida: sumar varias pistas ya normalizadas puede pasarse de volumen y distorsionar.
  private salida(): AudioNode {
    if (!this.limitador) {
      const limitador = this.contexto.createDynamicsCompressor();
      limitador.threshold.value = -2;
      limitador.knee.value = 0;
      limitador.ratio.value = 20;
      limitador.attack.value = 0.003;
      limitador.release.value = 0.1;
      limitador.connect(this.contexto.destination);
      this.limitador = limitador;
    }
    return this.limitador;
  }

  private liberar(): void {
    for (const fuente of this.fuentes) {
      try {
        fuente.stop();
      } catch {
        // Ya terminó sola: no hay nada que frenar.
      }
      fuente.disconnect();
    }
    this.fuentes = [];
  }
}
