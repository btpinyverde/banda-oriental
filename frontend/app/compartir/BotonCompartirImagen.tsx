"use client";

import { useState } from "react";
import "./compartir.css";

type Estado = "inactivo" | "preparando" | "descargada" | "error";

interface Props {
  /** El link (relativo al sitio) de la imagen que se comparte. */
  url: string;
  nombreDelArchivo: string;
  /** El texto que acompaña a la imagen en el menú de compartir. */
  texto: string;
  etiqueta: string;
}

/**
 * Comparte una imagen. En celulares usa el menú de compartir del dispositivo (con la imagen adjunta); donde no existe,
 * por ejemplo en una computadora, descarga la imagen para subirla a mano.
 */
export function BotonCompartirImagen({ url, nombreDelArchivo, texto, etiqueta }: Props) {
  const [estado, setEstado] = useState<Estado>("inactivo");

  async function compartir() {
    setEstado("preparando");
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) throw new Error(`La imagen respondió ${respuesta.status}`);
      const imagen = new File([await respuesta.blob()], nombreDelArchivo, { type: "image/png" });

      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [imagen] })) {
        // La imagen ya está lista: el menú del dispositivo es el que queda abierto, no hay nada más que preparar.
        setEstado("inactivo");
        await navigator.share({ files: [imagen], text: texto });
        return;
      }

      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(imagen);
      enlace.download = imagen.name;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
      setEstado("descargada");
    } catch (error) {
      // Cerrar el menú de compartir sin elegir nada no es un error.
      if (!(error instanceof DOMException && error.name === "AbortError")) setEstado("error");
    }
  }

  return (
    <div className="compartir">
      <button type="button" className="compartir__boton" onClick={compartir} disabled={estado === "preparando"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        {estado === "preparando" ? "Preparando imagen…" : etiqueta}
      </button>
      {estado === "descargada" && (
        <p className="compartir__aviso" role="status">
          Imagen descargada: subila a tu story.
        </p>
      )}
      {estado === "error" && (
        <p className="compartir__aviso compartir__aviso--error" role="alert">
          No se pudo preparar la imagen. Intentá de nuevo.
        </p>
      )}
    </div>
  );
}
