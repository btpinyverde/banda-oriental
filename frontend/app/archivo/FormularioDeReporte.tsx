"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { enviarReporte } from "../lib/reportes";
import { AdjuntarImagenes } from "../ui/AdjuntarImagenes";

export type Objetivo = { tipo: "artist" | "album" | "song"; id: number; nombre: string };

type Props = { tipo: "error" | "alta"; objetivo?: Objetivo };

const CLASE_DEL_OBJETIVO = { artist: "el artista", album: "el disco", song: "la canción" } as const;

/**
 * El formulario del archivo: "algo está mal" (sobre un artista, disco o canción) o "sumar un artista". Va a la API con la
 * comprobación humana; el campo `website` está escondido y solo lo completan los bots.
 */
export function FormularioDeReporte({ tipo, objetivo }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [imagenes, setImagenes] = useState<File[]>([]);

  async function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(datos.get(campo) ?? "").trim();
    const mensaje = texto("message");
    const nombre = texto("name");
    const contacto = texto("contact");

    if (tipo === "error" && !mensaje) return setAviso("Contanos qué está mal.");
    if (tipo === "alta" && !nombre) return setAviso("Falta el nombre del artista o banda.");
    if (tipo === "alta" && !contacto) return setAviso("Dejanos cómo contactarte (un correo o tu usuario de Instagram).");

    setAviso("");
    setEnviando(true);
    const resultado = await enviarReporte({
      kind: tipo,
      ...(objetivo && { target_type: objetivo.tipo, target_id: objetivo.id, target_label: objetivo.nombre }),
      name: nombre,
      contact: contacto,
      links: texto("links"),
      message: mensaje,
      website: texto("website"),
    }, imagenes);
    setEnviando(false);
    if (resultado.ok) setEnviado(true);
    else setAviso(resultado.error);
  }

  if (enviado) {
    return (
      <div className="reporte reporte--listo" role="status">
        <p className="reporte__gracias">¡Gracias! Lo vamos a revisar.</p>
        <p>{tipo === "alta" ? "Si hace falta, te escribimos al contacto que dejaste." : "Con tu aviso mejoramos el archivo."}</p>
        <Link href="/archivo" className="boton boton--violeta">
          Volver al archivo
        </Link>
      </div>
    );
  }

  return (
    <form className="reporte" onSubmit={alEnviar} noValidate>
      {objetivo && (
        <p className="reporte__objetivo">
          Sobre {CLASE_DEL_OBJETIVO[objetivo.tipo]}: <strong>{objetivo.nombre}</strong>
        </p>
      )}
      {tipo === "alta" && (
        <>
          <label className="reporte__campo">
            <span>Nombre del artista o banda *</span>
            <input name="name" type="text" maxLength={120} required autoComplete="off" />
          </label>
          <label className="reporte__campo">
            <span>Cómo te contactamos *</span>
            <input name="contact" type="text" maxLength={200} required placeholder="Un correo o tu usuario de Instagram" />
          </label>
          <label className="reporte__campo">
            <span>Enlaces (Spotify, YouTube, Bandcamp…)</span>
            <textarea name="links" rows={3} maxLength={500} />
          </label>
        </>
      )}
      <label className="reporte__campo">
        <span>{tipo === "error" ? "¿Qué está mal? *" : "¿Algo más para contarnos?"}</span>
        <textarea name="message" rows={5} maxLength={2000} required={tipo === "error"} />
      </label>
      {tipo === "error" && (
        <label className="reporte__campo">
          <span>Tu contacto (opcional, por si necesitamos preguntarte algo)</span>
          <input name="contact" type="text" maxLength={200} />
        </label>
      )}
      {tipo === "error" && <AdjuntarImagenes archivos={imagenes} alCambiar={setImagenes} />}
      {/* Trampa para bots: una persona no ve este campo; si viene completo, el reporte se descarta. */}
      <div className="reporte__trampa" aria-hidden="true">
        <label>
          Sitio web
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {aviso && (
        <p className="reporte__aviso" role="alert">
          {aviso}
        </p>
      )}
      <button type="submit" className="boton boton--violeta" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
