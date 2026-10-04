"use client";

import Link from "next/link";
import { BotonCompartir } from "../compartir/BotonCompartir";
import { datosDePartida, puedeRevelar } from "../lib/compartir/story";
import { estadisticas, type Partida } from "../lib/juego/historial";
import { claseCelda } from "../lib/juego/logica";
import { useDiaActual } from "../lib/juego/useDiaActual";
import { useHistorial } from "../lib/juego/useHistorial";
import type { Feedback } from "../lib/juego/tipos";

const fechaLarga = (dia: string) =>
  new Intl.DateTimeFormat("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${dia}T00:00:00Z`),
  );

const partidas = (n: number) => `${n} ${n === 1 ? "partida" : "partidas"}`;

function resultado(partida: Partida): string {
  if (!partida.ganada) return "No salió";
  if (partida.intentos === null) return "Ganada";
  return `Ganada en ${partida.intentos} ${partida.intentos === 1 ? "intento" : "intentos"}`;
}

/** Los colores de cada intento: una fila por intento, con las cuatro celdas (año, género, artista y disco). */
function Cuadricula({ feedback }: { feedback: Feedback[] }) {
  return (
    <div className="cuadricula" aria-hidden="true">
      {feedback.map((intento, fila) => (
        <div key={fila} className="cuadricula__fila">
          <span className={`cuadricula__celda cuadricula__celda--${claseCelda("year", intento.year)}`} />
          <span className={`cuadricula__celda cuadricula__celda--${claseCelda("genre", intento.genre)}`} />
          <span className={`cuadricula__celda cuadricula__celda--${claseCelda("artist", intento.artist)}`} />
          <span className={`cuadricula__celda cuadricula__celda--${claseCelda("album", intento.album)}`} />
        </div>
      ))}
    </div>
  );
}

/** Compartir un día: siempre sin revelar la canción; mostrándola solo cuando el día ya pasó, para no quemarla. */
function AccionesDeCompartir({ partida, hoy }: { partida: Partida; hoy: string }) {
  const oculta = datosDePartida(partida, false);
  if (!oculta) return null;
  const revelada = puedeRevelar(partida.dia, hoy) ? datosDePartida(partida, true) : undefined;

  return (
    <div className="dia__acciones">
      <BotonCompartir datos={oculta} />
      {revelada && <BotonCompartir datos={revelada} etiqueta="Compartir mostrando la canción" />}
    </div>
  );
}

/** Página "Mi historial": todo lo jugado en este dispositivo, con un resumen y cómo le fue a la persona cada día. */
export function Historial() {
  const historial = useHistorial();
  const hoy = useDiaActual();
  const stats = estadisticas(historial, hoy);
  const masRecientePrimero = [...historial].reverse();
  const mayor = Math.max(1, ...stats.distribucion);

  return (
    <main className="historial">
      <header className="historial__cabecera">
        <h1>Mi historial</h1>
        <p>Lo que jugaste se guarda en este navegador, sin necesidad de cuenta.</p>
      </header>

      {historial.length === 0 ? (
        <section className="historial__vacio">
          <p>Todavía no jugaste ningún día.</p>
          <Link href="/jugar" className="boton boton--grande boton--violeta">
            Jugar el diario
          </Link>
        </section>
      ) : (
        <>
          <section className="historial__resumen" aria-label="Resumen">
            <ul>
              <li>
                <strong>{stats.jugadas}</strong>
                <span>jugadas</span>
              </li>
              <li>
                <strong>{stats.porcentaje === null ? "—" : `${stats.porcentaje}%`}</strong>
                <span>aciertos</span>
              </li>
              <li>
                <strong>{stats.rachaActual}</strong>
                <span>racha actual</span>
              </li>
              <li>
                <strong>{stats.rachaMaxima}</strong>
                <span>racha máx.</span>
              </li>
            </ul>
          </section>

          <section className="historial__distribucion" aria-label="Intentos en las partidas ganadas">
            <h2>Intentos en las partidas ganadas</h2>
            <ul>
              {stats.distribucion.map((cantidad, i) => (
                <li key={i}>
                  <span className="historial__numero">{i + 1}</span>
                  <span className="historial__barra">
                    <span style={{ width: `${(cantidad / mayor) * 100}%` }} />
                  </span>
                  <span className="historial__cantidad">{partidas(cantidad)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="historial__titulo-lista">Días jugados</h2>
            <ul className="historial__dias" aria-label="Días jugados">
              {masRecientePrimero.map((partida) => (
                <li key={partida.dia} className="dia">
                  <div className="dia__texto">
                    <p className="dia__fecha">{fechaLarga(partida.dia)}</p>
                    <p className="dia__cancion">{partida.cancion.title}</p>
                    <p className="dia__artista">
                      {partida.cancion.artist} · {partida.cancion.album}
                    </p>
                  </div>
                  <div className="dia__resultado">
                    <span className={`dia__chip dia__chip--${partida.ganada ? "ganada" : "perdida"}`}>{resultado(partida)}</span>
                    {partida.feedback && partida.feedback.length > 0 && <Cuadricula feedback={partida.feedback} />}
                    <AccionesDeCompartir partida={partida} hoy={hoy} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
