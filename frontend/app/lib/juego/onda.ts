const MINIMO = 0.08;

/**
 * Altura (de 0 a 1) de cada barra de la onda: el volumen máximo de cada tramo del audio, normalizado para
 * que la barra más alta valga 1. `minimo` evita que los silencios dejen barras invisibles.
 */
export function picosDeOnda(señal: Float32Array, barras: number, minimo = MINIMO): number[] {
  const tramo = Math.max(1, Math.floor(señal.length / barras));
  const maximos = Array.from({ length: barras }, (_, i) => {
    let pico = 0;
    for (let j = i * tramo; j < Math.min(señal.length, (i + 1) * tramo); j++) pico = Math.max(pico, Math.abs(señal[j]));
    return pico;
  });
  const mayor = Math.max(...maximos);
  return maximos.map((pico) => (mayor === 0 ? minimo : Math.max(minimo, pico / mayor)));
}

/** Suma varias pistas muestra a muestra: lo que se oye cuando suenan juntas. Alcanza el largo de la más larga. */
export function sumarSeñales(señales: Float32Array[]): Float32Array {
  const largo = Math.max(0, ...señales.map((señal) => señal.length));
  const suma = new Float32Array(largo);
  for (const señal of señales) {
    for (let i = 0; i < señal.length; i++) suma[i] += señal[i];
  }
  return suma;
}

const MINIMO_PROVISORIA = 0.18;

/**
 * Onda de relleno mientras se lee el audio (o si no se puede leer): una forma fija que parece música, con
 * picos y valles que se superponen y bordes más bajos. No representa el audio; solo ocupa el lugar.
 */
export function ondaProvisoria(barras: number): number[] {
  return Array.from({ length: barras }, (_, i) => {
    const x = barras > 1 ? i / (barras - 1) : 0;
    const borde = Math.sin(Math.PI * x) ** 0.6; // sube desde los costados y llega a 1 al medio
    const ritmo = 0.55 + 0.45 * Math.abs(Math.sin(i * 0.9 + 0.4) * Math.cos(i * 0.37));
    const detalle = 0.8 + 0.2 * Math.sin(i * 2.3 + 1.1);
    return Math.max(MINIMO_PROVISORIA, Math.min(1, borde * ritmo * detalle * 1.15));
  });
}
