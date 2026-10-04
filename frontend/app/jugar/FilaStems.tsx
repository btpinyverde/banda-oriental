import { etapasDeStems } from "../lib/juego/logica";
import type { StemInfo, TipoStem } from "../lib/juego/tipos";

const ICONO: Record<TipoStem, string> = {
  drums: "/assets/icon-drums.svg",
  bass: "/assets/icon-bass.svg",
  other: "/assets/icon-note.svg",
  vocals: "/assets/icon-voice.svg",
};

/** Las cuatro pistas del día: las que ya se escuchan en color y las que faltan con candado. */
export function FilaStems({ desbloqueadas }: { desbloqueadas: StemInfo[] }) {
  return (
    <ul className="stems" aria-label="Pistas">
      {etapasDeStems(desbloqueadas).map((etapa) => (
        <li key={etapa.tipo} className={`stem ${etapa.desbloqueada ? "stem--abierta" : "stem--bloqueada"}`}>
          <span className={`stem__circulo stem__circulo--${etapa.tipo}`}>
            <img src={etapa.desbloqueada ? ICONO[etapa.tipo] : "/assets/lock.svg"} alt="" />
          </span>
          <span className="stem__nombre">{etapa.etiqueta}</span>
          <span className="stem__pista">Pista {etapa.pista}</span>
          <span className="solo-lectores">{etapa.desbloqueada ? " desbloqueada" : " bloqueada"}</span>
        </li>
      ))}
    </ul>
  );
}
