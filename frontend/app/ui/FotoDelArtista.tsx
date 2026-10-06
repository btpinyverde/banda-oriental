"use client";

import { useState } from "react";

const TONOS = 5;

/** La letra o el número con que empieza el nombre ("#TocoParaVos" → "T"), para el bloque de color que respalda a la foto. */
export function inicialDe(nombre: string): string {
  const letra = nombre.normalize("NFC").match(/[\p{L}\p{N}]/u);
  return letra ? letra[0].toLocaleUpperCase("es") : "·";
}

/** Un color de la marca por artista, siempre el mismo (sale del nombre, no del orden en que aparece). */
const tonoDe = (nombre: string) => [...nombre].reduce((suma, c) => suma + c.charCodeAt(0), 0) % TONOS;

/**
 * La foto del artista (de Deezer). Si no tiene, o la imagen no se puede cargar, queda la inicial del nombre sobre un color de la
 * marca: nunca una imagen inventada ni una imagen rota. Solo se aceptan fotos por https.
 */
export function FotoDelArtista({ nombre, foto, clase = "" }: { nombre: string; foto?: string; clase?: string }) {
  // Se recuerda qué foto falló, no un "falló" suelto: con otra foto (otro artista) se vuelve a intentar.
  const [fallida, setFallida] = useState<string | null>(null);
  const hayFoto = !!foto && foto.startsWith("https://") && fallida !== foto;
  return (
    <div className={`artista__foto artista__foto--tono-${tonoDe(nombre)} ${hayFoto ? "artista__foto--con-foto" : ""} ${clase}`.replace(/\s+/g, " ").trim()}>
      {hayFoto ? (
        <img src={foto} alt={`Foto de ${nombre}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFallida(foto)} />
      ) : (
        <span className="artista__inicial" aria-hidden="true">
          {inicialDe(nombre)}
        </span>
      )}
    </div>
  );
}
