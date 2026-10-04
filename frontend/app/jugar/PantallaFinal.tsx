"use client";

import Link from "next/link";
import { useState } from "react";
import { BotonCompartir } from "../compartir/BotonCompartir";
import type { DatosStory } from "../lib/compartir/story";
import { formatoCuentaAtras, LARGO_MAXIMO_NOMBRE, nombreValido } from "../lib/juego/logica";
import type { EstadoTerminado } from "../lib/juego/tipos";

interface Props {
  estado: EstadoTerminado;
  /** Intentos que se usaron, contados por el juego (el backend solo informa el ganador una vez enviado el puntaje). */
  intentosUsados: number;
  segundosParaProxima: number;
  /** Envía el nombre al ranking. Si falla, el mensaje del error se muestra tal cual. */
  alGuardarPuntaje: (nombre: string) => Promise<void>;
  /** Datos de la imagen para compartir; falta si no hay colores de los intentos para dibujar. */
  compartir?: DatosStory;
  /** El nombre que esta persona ya eligió para el ranking: se elige una sola vez y no se vuelve a pedir. */
  nombreFijo?: string | null;
}

const intentosDe = (n: number) => `${n} ${n === 1 ? "intento" : "intentos"}`;

/** Pantalla de cierre del día: revela la canción y, si se ganó, deja guardar el puntaje en el ranking. */
export function PantallaFinal({ estado, intentosUsados, segundosParaProxima, alGuardarPuntaje, compartir, nombreFijo }: Props) {
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { won, song } = estado;
  const yaEnviado = estado.score_submitted || guardado;

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    const limpio = nombreFijo || nombreValido(nombre);
    if (!limpio) {
      setError(`Escribí un nombre de hasta ${LARGO_MAXIMO_NOMBRE} caracteres.`);
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await alGuardarPuntaje(limpio);
      setGuardado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el puntaje.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="final" aria-labelledby="final-titulo">
      {won && <img className="final__festejo" src="/assets/burst-celebration.svg" alt="" />}
      <h2 className="final__titulo" id="final-titulo">
        {won ? "¡La sacaste!" : "Hoy no salió"}
      </h2>

      <div className="final__cancion">
        <p className="final__etiqueta">La canción de hoy era</p>
        <p className="final__nombre">{song.title}</p>
        <p className="final__artista">{song.artist}</p>
        <p className="final__disco">{song.album}</p>
      </div>

      {won && <p className="final__intentos">Resuelta en {intentosDe(estado.winning_attempt ?? intentosUsados)}</p>}

      {won && yaEnviado && (
        <>
          <p className="final__puntos">{estado.score !== undefined ? `${estado.score} puntos` : "Puntaje guardado"}</p>
          <Link href="/ranking" className="final__ranking">
            Ver el ranking →
          </Link>
        </>
      )}

      {compartir && (
        <div className="final__compartir">
          <BotonCompartir datos={compartir} />
          <p>Mañana podés compartirla mostrando la canción desde tu historial.</p>
        </div>
      )}

      {won && !yaEnviado && (
        <form className="final__formulario" onSubmit={guardar} noValidate>
          {nombreFijo ? (
            <p className="final__nombre-fijo">
              Vas a aparecer en el ranking como <strong>{nombreFijo}</strong>.
            </p>
          ) : (
            <>
              <label htmlFor="final-nombre">Tu nombre para el ranking</label>
              <input
                id="final-nombre"
                type="text"
                value={nombre}
                maxLength={LARGO_MAXIMO_NOMBRE + 20}
                autoComplete="nickname"
                onChange={(e) => setNombre(e.target.value)}
              />
              <p className="final__ayuda-nombre">Lo elegís una sola vez: después te acompaña en todos los rankings.</p>
            </>
          )}
          <button type="submit" className="boton boton--violeta" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar mi puntaje"}
          </button>
          {error && (
            <p className="final__error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      <p className="final__proxima">
        Nueva canción en <span className="final__cuenta">{formatoCuentaAtras(segundosParaProxima)}</span>
      </p>
    </section>
  );
}
