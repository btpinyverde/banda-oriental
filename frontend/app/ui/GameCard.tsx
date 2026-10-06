const COLUMNAS = ["Canción", "Año", "Género", "Artista", "Disco"] as const;

type Estado = "acierto" | "cerca" | "error";

// Canciones reales, con su artista, disco y año verdaderos (los del catálogo). El intento que se busca es "A las nueve" (verde =
// coincide, amarillo = cerca, rojo = no): "Brindis por Pierrot" es de 1985, lejos de 2012; "Yendo a la casa de Damián", de 2006, cerca.
const INTENTOS: { celdas: [string, Estado][] }[] = [
  {
    celdas: [
      ["Brindis por Pierrot", "error"],
      ["1985", "error"],
      ["Rock", "acierto"],
      ["Jaime Roos", "error"],
      ["Brindis por Pierrot", "error"],
    ],
  },
  {
    celdas: [
      ["Yendo a la casa de Damián", "error"],
      ["2006", "cerca"],
      ["Rock", "acierto"],
      ["El Cuarteto de Nos", "error"],
      ["Raro", "error"],
    ],
  },
  {
    celdas: [
      ["A las nueve", "acierto"],
      ["2012", "acierto"],
      ["Rock", "acierto"],
      ["No Te Va Gustar", "acierto"],
      ["El calor del pleno invierno", "acierto"],
    ],
  },
];

const INTENTOS_VACIOS = 3;

const STEMS = [
  { nombre: "Batería", icono: "icon-drums", color: "menta" },
  { nombre: "Bajo", icono: "icon-bass", color: "amarillo" },
  { nombre: "Voz", icono: "icon-voice", color: "gris" },
  { nombre: "Otros", icono: "lock", color: "gris" },
] as const;

/** Miniatura decorativa de cómo va a verse el juego. No es interactiva. */
export function GameCard() {
  return (
    <div className="juego" aria-hidden="true">
      <div className="juego__cabecera">
        <span className="chip chip--gris">#138</span>
        <span className="chip chip--gris">
          Modo clásico
          <svg width="9" height="6" viewBox="0 0 9 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m1 1 3.5 3.5L8 1" />
          </svg>
        </span>
        <span className="juego__cuenta">Nueva canción en</span>
        <span className="chip chip--blanco">12:36:08</span>
      </div>

      <div className="juego__reproductor">
        <span className="juego__play">
          <img src="/assets/play.svg" alt="" width={20} height={20} />
        </span>
        <img className="juego__onda" src="/assets/hero-waveform.svg" alt="" />
        <span className="juego__tiempo">0:00 / 0:30</span>
      </div>

      <ul className="juego__stems">
        {STEMS.map(({ nombre, icono, color }) => (
          <li key={nombre} className="stem">
            <span className={`stem__icono stem__icono--${color}`}>
              <img src={`/assets/${icono}.svg`} alt="" />
            </span>
            {nombre}
          </li>
        ))}
      </ul>

      <div className="juego__tabla">
        {COLUMNAS.map((c) => (
          <span key={c} className="celda celda--encabezado">
            {c}
          </span>
        ))}
        {INTENTOS.map(({ celdas }, fila) =>
          celdas.map(([texto, estado], col) => (
            <span key={`${fila}-${col}`} className={`celda celda--${estado}`}>
              <span className="celda__texto">{texto}</span>
            </span>
          )),
        )}
        {Array.from({ length: INTENTOS_VACIOS * COLUMNAS.length }, (_, i) => (
          <span key={`v-${i}`} className="celda celda--vacia" />
        ))}
      </div>
    </div>
  );
}
