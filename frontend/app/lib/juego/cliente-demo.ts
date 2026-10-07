import { normalizarTexto } from "./logica";
import {
  ApiError,
  type CancionCatalogo,
  type ClienteJuego,
  type EstadoDelDia,
  type Feedback,
  type ResultadoIntento,
  type ResultadoPuntaje,
  type StemInfo,
  type TipoStem,
} from "./tipos";

/**
 * CLIENTE DE DEMOSTRACIÓN, solo para maquetar y probar el juego mientras el backend no tiene el catálogo
 * ni una canción del día publicada. Los datos son de ejemplo: nombres de artistas uruguayos reales con
 * años, géneros y discos inventados, que no representan el catálogo. Se activa con
 * NEXT_PUBLIC_JUEGO_DEMO=1 y nunca en un build de producción (ver cliente.ts).
 * Los audios `/demo/etapa-N.mp3` no están en el repositorio: hay que ponerlos a mano en public/demo/.
 */
export const CATALOGO_DEMO: CancionCatalogo[] = [
  { id: 1, title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo", year: 2004, genre: "Rock" },
  { id: 2, title: "Sin saber", artist: "No Te Va Gustar", album: "Aunque cueste ver el sol", year: 2008, genre: "Rock" },
  { id: 3, title: "Cuando sea grande", artist: "El Cuarteto de Nos", album: "Raro", year: 2006, genre: "Rock" },
  { id: 4, title: "El día de la madre", artist: "El Cuarteto de Nos", album: "Bipolar", year: 2009, genre: "Rock" },
  { id: 5, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "Rock" },
  { id: 6, title: "Llenos de magia", artist: "La Vela Puerca", album: "Volumen", year: 2005, genre: "Rock" },
  { id: 7, title: "Universos paralelos", artist: "Jorge Drexler", album: "Eco", year: 2004, genre: "Pop" },
  { id: 8, title: "Todo se transforma", artist: "Jorge Drexler", album: "Eco", year: 2006, genre: "Pop" },
  { id: 9, title: "Candombe para Gardel", artist: "Rubén Rada", album: "Montevideo", year: 1995, genre: "Candombe" },
  { id: 10, title: "Los olimareños", artist: "Alfredo Zitarrosa", album: "Guitarra negra", year: 1976, genre: "Folklore" },
];

export const CANCION_DEL_DIA_DEMO = CATALOGO_DEMO[0];

const ORDEN_STEMS: TipoStem[] = ["drums", "bass", "other", "vocals"];
const PUNTAJE_BASE: Record<number, number> = { 1: 100, 2: 85, 3: 70, 4: 55, 5: 40, 6: 20 };

const POR_PAGINA_DEMO = 20;

const mismoTexto = (a: string, b: string) => normalizarTexto(a) === normalizarTexto(b);

/** Es la canción de ejemplo aunque venga de otro catálogo, con otro id o con otra forma de escribir el nombre. */
const esLaDelDia = (c: CancionCatalogo) =>
  mismoTexto(c.title, CANCION_DEL_DIA_DEMO.title) && mismoTexto(c.artist, CANCION_DEL_DIA_DEMO.artist);

function comparar(adivinada: CancionCatalogo, correcta: CancionCatalogo): Feedback {
  if (esLaDelDia(adivinada)) return { year: "exact", genre: "same", artist: "same", album: "same" };
  const igual = (a: string, b: string): "same" | "different" | "unknown" =>
    !a || !b ? "unknown" : mismoTexto(a, b) ? "same" : "different";
  return {
    year:
      adivinada.year == null || correcta.year == null
        ? "unknown"
        : adivinada.year === correcta.year
          ? "exact"
          : correcta.year > adivinada.year
            ? "newer"
            : "older",
    genre: igual(adivinada.genre, correcta.genre),
    artist: igual(adivinada.artist, correcta.artist),
    album: igual(adivinada.album, correcta.album),
  };
}

/**
 * `fuenteCanciones` permite probar el buscador con el catálogo real (NEXT_PUBLIC_JUEGO_DEMO=catalogo-real)
 * sin necesitar una canción del día publicada: el juego sigue siendo de ejemplo, solo cambia la lista.
 */
export function crearClienteDemo(fuenteCanciones?: () => Promise<CancionCatalogo[]>): ClienteJuego {
  let catalogo: Promise<CancionCatalogo[]> | null = null;
  const obtenerCatalogo = () => (catalogo ??= fuenteCanciones ? fuenteCanciones() : Promise.resolve(CATALOGO_DEMO));

  const hoy = new Date().toISOString().slice(0, 10);
  const intentos: { cancion: CancionCatalogo; feedback: Feedback }[] = [];
  let ganado = false;
  let puntaje: ResultadoPuntaje | null = null;

  const terminado = () => ganado || intentos.length >= 6;
  const stemsDesbloqueados = (cantidad: number): StemInfo[] =>
    ORDEN_STEMS.slice(0, cantidad).map((tipo, i) => ({
      stem_type: tipo,
      unlock_order: i + 1,
      url: `/demo/etapa-${i + 1}.mp3`,
    }));

  return {
    async estadoDelDia(): Promise<EstadoDelDia> {
      if (terminado()) {
        const { title, artist, album } = CANCION_DEL_DIA_DEMO;
        return {
          finished: true,
          day: hoy,
          number: 138,
          won: ganado,
          score_submitted: puntaje !== null,
          song: { title, artist, album },
          ...(puntaje ? { score: puntaje.score, winning_attempt: puntaje.winning_attempt } : {}),
        };
      }
      const numero = intentos.length + 1;
      return {
        finished: false,
        day: hoy,
        number: 138,
        attempt_number: numero,
        attempts_remaining: 6 - intentos.length,
        unlocked_stems: stemsDesbloqueados(numero),
        feedback_history: intentos.map((intento, i) => ({ attempt_number: i + 1, feedback: intento.feedback })),
      };
    },

    async enviarIntento(_id, numeroDeIntento, idCancion): Promise<ResultadoIntento> {
      if (terminado()) throw new ApiError("Ya jugaste hoy.", 400);
      if (numeroDeIntento !== intentos.length + 1) throw new ApiError("Número de intento inválido.", 400);
      const cancion = (await obtenerCatalogo()).find((c) => c.id === idCancion);
      if (!cancion) throw new ApiError("Canción no encontrada.", 400);

      const feedback = comparar(cancion, CANCION_DEL_DIA_DEMO);
      const correcta = esLaDelDia(cancion);
      intentos.push({ cancion, feedback });
      ganado = correcta;
      return {
        is_correct: correcta,
        attempt_number: numeroDeIntento,
        feedback,
        finished: correcta || numeroDeIntento === 6,
        attempts_remaining: 6 - numeroDeIntento,
      };
    },

    async enviarPuntaje(_id, nombre): Promise<ResultadoPuntaje> {
      if (!ganado) throw new ApiError("Todavía no ganaste hoy.", 400);
      if (puntaje) throw new ApiError("Ya enviaste tu puntaje de hoy.", 400);
      puntaje = { score: PUNTAJE_BASE[intentos.length], winning_attempt: intentos.length, display_name: nombre };
      return puntaje;
    },

    /** Igual que la API real: todas las palabras en título, artista o disco, de a páginas. */
    async buscarCanciones(texto, pagina) {
      const palabras = normalizarTexto(texto).split(/\s+/).filter(Boolean);
      const todas = (await obtenerCatalogo()).filter((c) => {
        const alMenos = normalizarTexto(`${c.title} ${c.artist} ${c.album}`);
        return palabras.every((palabra) => alMenos.includes(palabra));
      });
      const desde = (pagina - 1) * POR_PAGINA_DEMO;
      return { canciones: todas.slice(desde, desde + POR_PAGINA_DEMO), hayMas: todas.length > desde + POR_PAGINA_DEMO };
    },
  };
}
