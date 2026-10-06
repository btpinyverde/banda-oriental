"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { enviarReporte } from "../lib/reportes";
import { AdjuntarImagenes } from "../ui/AdjuntarImagenes";

export const MOTIVOS = ["Tengo una duda", "Algo no funciona", "Una idea o sugerencia", "Soy artista o titular de derechos", "Otro motivo"];

const PARECE_UN_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El formulario de la página de contacto. Va a la API como mensaje de contacto, con el motivo elegido en su propio campo. */
export function FormularioDeContacto() {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [imagenes, setImagenes] = useState<File[]>([]);

  async function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(datos.get(campo) ?? "").trim();
    const nombre = texto("name");
    const correo = texto("contact");
    const motivo = texto("motivo");
    const mensaje = texto("message");

    if (!nombre) return setAviso("Contanos tu nombre.");
    if (!correo || !PARECE_UN_CORREO.test(correo)) return setAviso("Escribí un correo electrónico válido, para poder responderte.");
    if (!motivo) return setAviso("Elegí un motivo.");
    if (!mensaje) return setAviso("Escribí tu mensaje.");

    setAviso("");
    setEnviando(true);
    const resultado = await enviarReporte({ kind: "contacto", name: nombre, contact: correo, reason: motivo, message: mensaje, website: texto("website") }, imagenes);
    setEnviando(false);
    if (resultado.ok) setEnviado(true);
    else setAviso(resultado.error);
  }

  if (enviado) {
    return (
      <div className="contacto-form contacto-form--listo" role="status">
        <p className="contacto-form__gracias">¡Gracias por escribirnos!</p>
        <p>Leímos tu mensaje y te vamos a responder lo antes posible.</p>
        <Link href="/" className="boton boton--violeta">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form className="contacto-form" onSubmit={alEnviar} noValidate>
      <label className="contacto-form__campo">
        <span>Nombre</span>
        <input name="name" type="text" placeholder="Tu nombre" maxLength={120} autoComplete="name" required />
      </label>
      <label className="contacto-form__campo">
        <span>Correo electrónico</span>
        <input name="contact" type="email" placeholder="tu@correo.com" maxLength={200} autoComplete="email" required />
      </label>
      <label className="contacto-form__campo">
        <span>Motivo</span>
        <select name="motivo" defaultValue="" required>
          <option value="" disabled>
            Seleccioná un motivo
          </option>
          {MOTIVOS.map((motivo) => (
            <option key={motivo} value={motivo}>
              {motivo}
            </option>
          ))}
        </select>
      </label>
      <label className="contacto-form__campo">
        <span>Mensaje</span>
        <textarea name="message" rows={4} placeholder="Contanos en qué podemos ayudarte..." maxLength={1900} required />
      </label>
      <AdjuntarImagenes archivos={imagenes} alCambiar={setImagenes} />
      {/* Trampa para bots: una persona no ve este campo; si viene completo, el mensaje se descarta. */}
      <div className="contacto-form__trampa" aria-hidden="true">
        <label>
          Sitio web
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {aviso && (
        <p className="contacto-form__aviso" role="alert">
          {aviso}
        </p>
      )}
      <button type="submit" className="boton boton--grande boton--violeta contacto-form__enviar" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar mensaje"}
        <img src="/assets/arrow-right.svg" alt="" width={18} height={18} style={{ filter: "brightness(0) invert(1)" }} />
      </button>
    </form>
  );
}
