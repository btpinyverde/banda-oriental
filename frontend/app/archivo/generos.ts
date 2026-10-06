export interface ChipDeGenero {
  /** El género tal como está en el catálogo (con el que se filtra). */
  valor: string;
  /** Cómo se llama el chip. */
  etiqueta: string;
}

/** Los géneros de siempre del archivo, en el orden del diseño, con los nombres con que aparecen en el catálogo (de MusicBrainz y de Deezer). */
const DE_SIEMPRE: { etiqueta: string; nombres: string[] }[] = [
  { etiqueta: "Rock", nombres: ["rock"] },
  { etiqueta: "Pop", nombres: ["pop"] },
  { etiqueta: "Candombe", nombres: ["candombe"] },
  { etiqueta: "Tango", nombres: ["tango"] },
  { etiqueta: "Hip hop", nombres: ["hip hop", "hip-hop", "rap/hip hop", "rap"] },
  { etiqueta: "Electrónica", nombres: ["electrónica", "electronica", "electronic", "electro"] },
  { etiqueta: "Latino", nombres: ["latino"] },
  { etiqueta: "Folk", nombres: ["folk"] },
];

/**
 * Los chips de género: primero los de siempre (si hay canciones de ellos en el catálogo), después los más frecuentes que
 * falten, hasta `maximo`. `generos` viene en orden de frecuencia. Un chip filtra por el género tal como está en el catálogo.
 */
export function elegirChips(generos: string[], maximo = 7): ChipDeGenero[] {
  const disponibles = [...new Map(generos.map((g) => g.trim()).filter(Boolean).map((g) => [g.toLowerCase(), g])).values()];
  const usados = new Set<string>();
  const chips: ChipDeGenero[] = [];
  for (const { etiqueta, nombres } of DE_SIEMPRE) {
    const encontrado = disponibles.find((g) => !usados.has(g) && nombres.includes(g.toLowerCase()));
    if (encontrado) {
      usados.add(encontrado);
      chips.push({ valor: encontrado, etiqueta });
    }
  }
  for (const genero of disponibles) {
    if (chips.length >= maximo) break;
    if (!usados.has(genero)) chips.push({ valor: genero, etiqueta: genero });
  }
  return chips.slice(0, maximo);
}
