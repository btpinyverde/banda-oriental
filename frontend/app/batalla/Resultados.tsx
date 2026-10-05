"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EstadoSala } from "../lib/batallas/api-batallas";

const faltan = (iso: string, ahoraMs: number) => Math.max(0, Math.ceil((Date.parse(iso) - ahoraMs) / 1000));

/** Entre rondas: la canción correcta, lo que sacó cada uno y el ranking parcial. Al terminar: el ranking final de la batalla. */
export function Resultados({ sala, ahora }: { sala: EstadoSala; ahora: () => number }) {
  const [, setLatido] = useState(0);
  // Repinta seguido para que la cuenta hacia la siguiente ronda no se quede quieta entre consulta y consulta.
  useEffect(() => {
    const id = setInterval(() => setLatido((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const termino = sala.status === "finished" || sala.phase.name === "finished";
  const cancion = sala.reveal?.song;
  const mia = sala.reveal?.my_answer ?? null;
  const siguiente = !termino ? sala.round : null;

  return (
    <section className="batalla__tarjeta">
      {termino ? <h1 className="batalla__titulo">Resultados</h1> : <p className="batalla__ronda">Ronda {sala.phase.index + 1} de {sala.round_count}</p>}

      {cancion && (
        <p className="batalla__bajada">
          {termino ? "La última canción era" : "Era"} <strong>{cancion.title}</strong> de {cancion.artist}.
        </p>
      )}

      {sala.role === "player" && (
        <p className="batalla__tu-puntaje">
          {mia === null ? "No respondiste en esta ronda." : mia.correct ? `Acertaste: +${mia.points} puntos.` : "Esta vez no: 0 puntos."}
        </p>
      )}

      {sala.ranking && (
        <table className="batalla__tabla">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>Jugador</th>
              <th>Puntos</th>
              <th>Aciertos</th>
            </tr>
          </thead>
          <tbody>
            {sala.ranking.map((fila) => (
              <tr key={fila.name}>
                <td>{fila.position}</td>
                <td>{fila.name}</td>
                <td>{fila.points}</td>
                <td>{fila.correct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {siguiente && <p className="batalla__nota">La siguiente canción arranca en {faltan(siguiente.starts_at, ahora())} s.</p>}

      {termino && (
        <div className="batalla__acciones">
          <Link href="/ranking?vista=batallas" className="boton boton--violeta">
            Ver mis batallas
          </Link>
          <Link href="/batalla" className="boton boton--violeta-claro">
            Crear otra batalla
          </Link>
        </div>
      )}
    </section>
  );
}
