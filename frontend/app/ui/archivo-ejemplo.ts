import type { ArtistaArchivo } from "./ArchivoArtistas";

/**
 * DATOS DE EJEMPLO, solo para maquetar la landing mientras la API del catálogo no está lista.
 * Los nombres son de artistas uruguayos reales, pero las cantidades de canciones y los géneros
 * son inventados y no representan el catálogo. Sin tapas a propósito: cuando se conecte la API
 * cada card usará la imagen que devuelva. Reemplazar esto por la respuesta real y borrar el archivo.
 */
export const ARTISTAS_EJEMPLO: ArtistaArchivo[] = [
  { id: "ntvg", nombre: "No Te Va Gustar", canciones: 28, generos: ["Rock"] },
  { id: "drexler", nombre: "Jorge Drexler", canciones: 16, generos: ["Pop", "Folklore"] },
  { id: "buitres", nombre: "Buitres", canciones: 12, generos: ["Rock"] },
  { id: "cuarteto", nombre: "El Cuarteto de Nos", canciones: 10, generos: ["Rock", "Pop"] },
  { id: "velapuerca", nombre: "La Vela Puerca", canciones: 9, generos: ["Rock"] },
  { id: "rada", nombre: "Rubén Rada", canciones: 14, generos: ["Candombe"] },
  { id: "zitarrosa", nombre: "Alfredo Zitarrosa", canciones: 11, generos: ["Folklore"] },
  { id: "viglietti", nombre: "Daniel Viglietti", canciones: 8, generos: ["Folklore"] },
  { id: "sosa", nombre: "Julio Sosa", canciones: 7, generos: ["Tango"] },
];

/** Los chips de la referencia. Electrónica y Hip hop quedan sin artistas de ejemplo a propósito. */
export const GENEROS_EJEMPLO = ["Rock", "Pop", "Candombe", "Tango", "Electrónica", "Hip hop", "Folklore"];

export const TOTAL_CANCIONES_EJEMPLO = ARTISTAS_EJEMPLO.reduce((suma, a) => suma + a.canciones, 0);
