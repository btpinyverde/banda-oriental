/** Trazos de la línea ondulada hecha a mano. Cada divisor usa uno distinto para que no se repitan. */
const TRAZOS = {
  /** Ondas amplias y suaves (pie de página). */
  suave: "M0 14C110 5 210 21 340 14S600 6 720 16 980 22 1100 12 1230 8 1272 11",
  /** Ondas más cortas, que nacen más abajo a la izquierda (cabecera de "Cómo se juega"). */
  corta: "M0 19C70 15 130 6 215 9S350 21 470 17 640 5 760 9 930 20 1050 15 1210 4 1272 9",
} as const;

/** Línea ondulada hecha a mano que separa secciones. */
export function Ondulada({
  className = "",
  trazo = "suave",
}: {
  className?: string;
  trazo?: keyof typeof TRAZOS;
}) {
  return (
    <svg className={`ondulada ${className}`.trim()} viewBox="0 0 1272 24" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={TRAZOS[trazo]}
        stroke="#e5e0e1"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
