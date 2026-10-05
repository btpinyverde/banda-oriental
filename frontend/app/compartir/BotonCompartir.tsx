"use client";

import { textoParaCompartir, urlDeStory, type DatosStory } from "../lib/compartir/story";
import { SITIO_URL } from "../lib/seo";
import { BotonCompartirImagen } from "./BotonCompartirImagen";

function nombreDelArchivo(datos: DatosStory): string {
  const identificador = datos.numero ?? datos.dia ?? "resultado";
  return `banda-oriental-${identificador}${datos.cancion ? "-revelada" : ""}.png`;
}

/** Comparte el resultado del día como imagen para una story (ver BotonCompartirImagen). */
export function BotonCompartir({ datos, etiqueta = "Compartir resultado" }: { datos: DatosStory; etiqueta?: string }) {
  return (
    <BotonCompartirImagen
      url={urlDeStory(datos)}
      nombreDelArchivo={nombreDelArchivo(datos)}
      texto={textoParaCompartir(datos, SITIO_URL)}
      etiqueta={etiqueta}
    />
  );
}
