"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

export const MAXIMO_DE_IMAGENES = 3;
export const MAXIMO_DE_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

const tamano = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * El campo para adjuntar capturas a un mensaje: hasta tres imágenes PNG, JPG o WEBP de hasta 5 MB cada una, con vista previa y un
 * botón para quitar cada una. La lista la guarda quien lo usa (`archivos`); el servidor vuelve a revisar todo.
 */
export function AdjuntarImagenes({ archivos, alCambiar }: { archivos: File[]; alCambiar: (archivos: File[]) => void }) {
  const [aviso, setAviso] = useState("");
  const vistas = useMemo(() => archivos.map((archivo) => URL.createObjectURL(archivo)), [archivos]);
  useEffect(() => () => vistas.forEach((url) => URL.revokeObjectURL(url)), [vistas]);

  function alElegir(evento: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(evento.target.files ?? []);
    const nuevos: File[] = [];
    const problemas = new Set<string>();
    for (const archivo of elegidos) {
      if (!TIPOS.includes(archivo.type)) problemas.add(`"${archivo.name}" no se adjuntó: tiene que ser PNG, JPG o WEBP.`);
      else if (archivo.size > MAXIMO_DE_BYTES) problemas.add(`"${archivo.name}" no se adjuntó: pesa más de 5 MB.`);
      else if (archivos.length + nuevos.length >= MAXIMO_DE_IMAGENES) problemas.add(`Podés adjuntar hasta ${MAXIMO_DE_IMAGENES} imágenes.`);
      else nuevos.push(archivo);
    }
    setAviso([...problemas].join(" "));
    if (nuevos.length) alCambiar([...archivos, ...nuevos]);
    try {
      evento.target.value = ""; // para poder volver a elegir el mismo archivo
    } catch {
      /* algunos navegadores no dejan limpiarlo */
    }
  }

  const quitar = (indice: number) => {
    setAviso("");
    alCambiar(archivos.filter((_, i) => i !== indice));
  };

  return (
    <div className="adjuntar">
      <label className="adjuntar__boton">
        <span>Adjuntar imágenes (opcional)</span>
        <input type="file" accept={TIPOS.join(",")} multiple onChange={alElegir} className="adjuntar__entrada" />
      </label>
      <p className="adjuntar__ayuda">Hasta {MAXIMO_DE_IMAGENES} imágenes de 5 MB (PNG, JPG o WEBP).</p>
      {archivos.length > 0 && (
        <ul className="adjuntar__lista">
          {archivos.map((archivo, i) => (
            <li key={`${archivo.name}-${i}`} className="adjuntar__item">
              <img src={vistas[i]} alt="" className="adjuntar__vista" />
              <span className="adjuntar__nombre">{archivo.name}</span>
              <span className="adjuntar__peso">{tamano(archivo.size)}</span>
              <button type="button" className="adjuntar__quitar" aria-label={`Quitar ${archivo.name}`} onClick={() => quitar(i)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && (
        <p className="adjuntar__aviso" role="alert">
          {aviso}
        </p>
      )}
    </div>
  );
}
