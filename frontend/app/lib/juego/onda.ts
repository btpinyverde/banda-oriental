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
