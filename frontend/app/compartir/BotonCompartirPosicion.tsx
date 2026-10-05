"use client";

import { datosDePosicion, nombreDelArchivoPosicion, textoParaCompartirPosicion, urlDePosicion } from "../lib/compartir/posicion";
import type { RankingServidor } from "../lib/juego/tipos";
import { SITIO_URL } from "../lib/seo";
import { BotonCompartirImagen } from "./BotonCompartirImagen";

/** Para presumir en redes el puesto que se tiene en el ranking que se está mirando (día, semana, mes o de siempre). */
export function BotonCompartirPosicion({ ranking }: { ranking: RankingServidor }) {
  const datos = datosDePosicion(ranking);
  if (!datos) return null;
  return (
    <BotonCompartirImagen
      url={urlDePosicion(datos)}
      nombreDelArchivo={nombreDelArchivoPosicion(datos)}
      texto={textoParaCompartirPosicion(datos, SITIO_URL)}
      etiqueta="Compartir mi posición"
    />
  );
}
