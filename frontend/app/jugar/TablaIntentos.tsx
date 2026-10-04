import { claseCelda, flechaAnio } from "../lib/juego/logica";
import type { CancionCatalogo, EjeFeedback, Feedback } from "../lib/juego/tipos";

export interface IntentoMostrado {
  numero: number;
  feedback: Feedback;
  /** Lo que se adivinó. Falta si se limpió el navegador y el backend tampoco lo manda. */
  cancion?: CancionCatalogo;
  /** Título adivinado, si el backend lo manda (`guessed_text`) y no hay datos guardados. */
  textoAdivinado?: string;
  correcto: boolean;
}

const COLUMNAS = ["Canción", "Año", "Género", "Artista", "Disco"];
const INTENTOS_MAXIMOS = 6;
// La canción y el artista suelen ser los textos más largos: llevan más ancho.
const ANCHOS = ["23%", "15%", "18%", "22%", "22%"];

const TEXTO_ANIO: Record<Feedback["year"], string> = {
  exact: "Acierto",
  newer: "El año correcto es posterior",
  older: "El año correcto es anterior",
  unknown: "Sin datos",
};

function textoDeEstado(eje: Exclude<EjeFeedback, "year">, valor: Feedback[typeof eje]): string {
  const clase = claseCelda(eje, valor);
  return clase === "acierto" ? "Acierto" : clase === "error" ? "No coincide" : "Sin datos";
}

const SinDato = "—";

function FilaCompleta({ intento }: { intento: IntentoMostrado }) {
  const { feedback, cancion, textoAdivinado, correcto } = intento;
  const ejes: { eje: Exclude<EjeFeedback, "year">; texto: string | undefined }[] = [
    { eje: "genre", texto: cancion?.genre },
    { eje: "artist", texto: cancion?.artist },
    { eje: "album", texto: cancion?.album },
  ];

  return (
    <tr>
      <td className={`celda celda--titulo${correcto ? " celda--acierto" : ""}`}>
        <span className="celda__texto">{cancion?.title ?? textoAdivinado ?? SinDato}</span>
        {correcto && <span className="solo-lectores">Acierto</span>}
      </td>
      <td className={`celda celda--anio celda--${claseCelda("year", feedback.year)}`}>
        <span className="celda__texto">
          {cancion?.year ?? SinDato}
          <span aria-hidden="true"> {flechaAnio(feedback.year)}</span>
        </span>
        <span className="solo-lectores">{TEXTO_ANIO[feedback.year]}</span>
      </td>
      {ejes.map(({ eje, texto }) => (
        <td key={eje} className={`celda celda--${claseCelda(eje, feedback[eje])}`}>
          <span className="celda__texto">{texto || SinDato}</span>
          <span className="solo-lectores">{textoDeEstado(eje, feedback[eje])}</span>
        </td>
      ))}
    </tr>
  );
}

/** Tabla de seis intentos: lo adivinado en cada fila, pintado según lo que respondió el backend. */
export function TablaIntentos({ intentos }: { intentos: IntentoMostrado[] }) {
  return (
    <table className="tabla-intentos" aria-label="Intentos">
      <colgroup>
        {ANCHOS.map((ancho, i) => (
          <col key={i} style={{ width: ancho }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {COLUMNAS.map((columna) => (
            <th key={columna} scope="col" className="celda celda--encabezado">
              {columna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: INTENTOS_MAXIMOS }, (_, i) => {
          const intento = intentos.find((candidato) => candidato.numero === i + 1);
          if (intento) return <FilaCompleta key={i} intento={intento} />;
          return (
            <tr key={i} aria-hidden="true">
              {COLUMNAS.map((columna) => (
                <td key={columna} className="celda celda--vacia" />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
