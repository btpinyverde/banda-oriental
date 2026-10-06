"use client";

import { useEffect, useState } from "react";
import { batallaActiva } from "../lib/funciones";
import { usePuedeCrearBatallas } from "../lib/batallas/usePuedeCrearBatallas";
import { MisBatallas } from "./MisBatallas";
import { Ranking } from "./Ranking";

type Vista = "diario" | "batallas";

/**
 * La pantalla del ranking con dos vistas: el ranking del juego diario y "Mis batallas" (el ranking de cada batalla en la
 * que jugaste o que organizaste, privado). El selector aparece solo para quien puede usar el modo batalla; para el resto es el ranking de siempre.
 */
export function VistaDelRanking() {
  // Con el modo visible lo ve todo el mundo (quien jugó en una sala quiere ver su batalla); con el modo apagado, solo quien puede crear salas.
  const { puede } = usePuedeCrearBatallas();
  const habilitada = batallaActiva() || puede;
  const [vista, setVista] = useState<Vista>("diario");

  useEffect(() => {
    if (habilitada && new URLSearchParams(window.location.search).get("vista") === "batallas") setVista("batallas");
  }, [habilitada]);

  if (!habilitada) return <Ranking />;

  const selector = (
    <div className="ranking__vistas" role="group" aria-label="Qué ranking ver">
      {(["diario", "batallas"] as const).map((valor) => (
        <button key={valor} type="button" className="ranking__vista" aria-pressed={vista === valor} onClick={() => setVista(valor)}>
          {valor === "diario" ? "Diario" : "Mis batallas"}
        </button>
      ))}
    </div>
  );
  return vista === "diario" ? <Ranking selector={selector} /> : <MisBatallas selector={selector} />;
}
