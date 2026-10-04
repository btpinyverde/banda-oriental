"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { LARGO_MAXIMO_NOMBRE, nombreValido } from "../lib/juego/logica";

interface Props {
  nombreActual: string;
  /** Pide el cambio al servidor. Si lo rechaza, el mensaje del error se muestra tal cual. */
  alCambiar: (nombre: string) => Promise<void>;
}

/** Cambiar el nombre con el que se aparece en los rankings. Cerrado por defecto: se usa pocas veces. */
export function CambiarNombre({ nombreActual, alCambiar }: Props) {
  const idError = useId();
  const [nombre, setNombre] = useState(nombreActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);

  // Si el nombre cambia de afuera (otra sesión, otra cuenta) el campo muestra el nuevo.
  useEffect(() => setNombre(nombreActual), [nombreActual]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setListo(null);
    const limpio = nombreValido(nombre);
    if (!limpio) return setError(`Escribí un nombre de hasta ${LARGO_MAXIMO_NOMBRE} caracteres.`);
    if (limpio === nombreActual) return setError("Es el mismo nombre que tenés ahora.");
    setError(null);
    setGuardando(true);
    try {
      await alCambiar(limpio);
      setListo(limpio);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el nombre.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <details className="cambiar-nombre">
      <summary>Cambiar mi nombre</summary>
      <form onSubmit={guardar} noValidate>
        <label htmlFor="cambiar-nombre-campo">Tu nombre en el ranking</label>
        <input
          id="cambiar-nombre-campo"
          type="text"
          value={nombre}
          maxLength={LARGO_MAXIMO_NOMBRE + 20}
          autoComplete="nickname"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          onChange={(e) => setNombre(e.target.value)}
        />
        <button type="submit" className="boton boton--violeta" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <p className="cambiar-nombre__ayuda">Entre un cambio y otro hay una espera, y el nombre no puede ser el de otra persona.</p>
        {error && (
          <p id={idError} className="cambiar-nombre__error" role="alert">
            {error}
          </p>
        )}
        {listo && !error && <p role="status">Listo: ahora aparecés como {listo}.</p>}
      </form>
    </details>
  );
}
