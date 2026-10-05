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

      {sala.role === "host" && sala.stats && <DatosDeLaRonda datos={sala.stats} />}

      {termino && <Podio sala={sala} />}

      {sala.team_ranking && sala.team_ranking.length > 0 && (
        <table className="batalla__tabla" aria-label="Ranking por equipos">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>Equipo</th>
              <th>Promedio</th>
              <th>Total</th>
              <th>Integrantes</th>
            </tr>
          </thead>
          <tbody>
            {sala.team_ranking.map((fila) => (
              <tr key={fila.id}>
                <td>{fila.position}</td>
                <td>
                  <span className="batalla__chapa" style={{ background: fila.color }}>
                    {fila.name}
                  </span>
                </td>
                <td>{fila.points}</td>
                <td>{fila.total}</td>
                <td>{fila.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sala.ranking && (
        <table className="batalla__tabla" aria-label="Ranking de jugadores">
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

const segundos = (n: number) => n.toFixed(1).replace(".", ",");

/** Para la pantalla grande: cuánta gente respondió, cuánta acertó, quién fue más rápida y qué fue lo más elegido. */
function DatosDeLaRonda({ datos }: { datos: NonNullable<EstadoSala["stats"]> }) {
  const porcentaje = datos.total > 0 ? Math.round((datos.correct / datos.total) * 100) : 0;
  return (
    <section className="batalla__datos" aria-label="Datos de la ronda">
      <p>
        Respondieron {datos.answered} de {datos.total}.
      </p>
      <p>
        Acertaron {datos.correct} ({porcentaje} %).
      </p>
      {datos.fastest && (
        <p>
          La más rápida: {datos.fastest.name} ({segundos(datos.fastest.seconds)} s).
        </p>
      )}
      {datos.top_guesses.length > 0 && (
        <>
          <p>Lo más elegido:</p>
          <ul>
            {datos.top_guesses.map((g) => (
              <li key={`${g.title}-${g.artist}`}>
                {g.title} — {g.artist} · {g.count} {g.count === 1 ? "voto" : "votos"}
                {g.correct ? " ✓ la correcta" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Al terminar: los tres primeros puestos (y, si se jugó por equipos, los tres primeros equipos). */
function Podio({ sala }: { sala: EstadoSala }) {
  const personas = (sala.ranking ?? []).slice(0, 3);
  const equipos = (sala.team_ranking ?? []).slice(0, 3);
  return (
    <div className="batalla__podios">
      {personas.length > 0 && (
        <ol className="batalla__podio" aria-label="Podio de jugadores">
          {personas.map((fila) => (
            <li key={fila.name} className={`batalla__puesto batalla__puesto--${fila.position}`}>
              <strong>{fila.position}.º</strong> {fila.name} — {fila.points} puntos
            </li>
          ))}
        </ol>
      )}
      {equipos.length > 0 && (
        <ol className="batalla__podio" aria-label="Podio de equipos">
          {equipos.map((fila) => (
            <li key={fila.id} className={`batalla__puesto batalla__puesto--${fila.position}`} style={{ borderColor: fila.color }}>
              <strong>{fila.position}.º</strong> {fila.name} — {fila.points} de promedio
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
