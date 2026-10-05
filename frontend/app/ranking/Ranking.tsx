"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BotonCompartirPosicion } from "../compartir/BotonCompartirPosicion";
import { idDeDispositivo } from "../lib/juego/dispositivo";
import { pedirRanking } from "../lib/juego/estadisticas-servidor";
import type { FilaRanking, PeriodoRanking, RankingServidor } from "../lib/juego/tipos";

const PESTANIAS: { periodo: PeriodoRanking; etiqueta: string; nombre: string }[] = [
  { periodo: "day", etiqueta: "Hoy", nombre: "de hoy" },
  { periodo: "week", etiqueta: "Esta semana", nombre: "de esta semana" },
  { periodo: "month", etiqueta: "Este mes", nombre: "de este mes" },
  { periodo: "all", etiqueta: "Siempre", nombre: "de todos los tiempos" },
];

type Estado = { tipo: "cargando" } | { tipo: "error" } | { tipo: "listo"; ranking: RankingServidor };

const numero = new Intl.NumberFormat("es-UY");
const partidas = (n: number) => `${n} ${n === 1 ? "partida" : "partidas"}`;

const nombreDelDia = (dia: string) => new Intl.DateTimeFormat("es-UY", { weekday: "long", timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`)).toLowerCase();
// En español los meses y los días van en minúscula; con el mes solo, Intl lo devuelve a veces con mayúscula.
const nombreDelMes = (dia: string) => new Intl.DateTimeFormat("es-UY", { month: "long", timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`)).toLowerCase();
const fechaCorta = (dia: string) => `${nombreDelDia(dia)} ${Number(dia.slice(8, 10))} de ${nombreDelMes(dia)}`;

/** Qué días cubre el ranking que se está mirando. */
function rotulo(ranking: RankingServidor): string {
  const { period, from, to } = ranking;
  if (period === "all" || !from || !to) return "Desde que arrancó el juego.";
  if (period === "day") return `Hoy, ${fechaCorta(from)}.`;
  if (period === "week") return `Del ${fechaCorta(from)} al ${fechaCorta(to)}.`;
  return `${nombreDelMes(from).replace(/^./, (c) => c.toUpperCase())} de ${from.slice(0, 4)}.`;
}

function Fila({ fila, esMia }: { fila: FilaRanking; esMia: boolean }) {
  return (
    <li className={`ranking__fila${esMia ? " ranking__fila--mia" : ""}${fila.rank <= 3 ? ` ranking__fila--top${fila.rank}` : ""}`}>
      <span className="ranking__puesto" aria-label={`Puesto ${fila.rank}`}>
        {fila.rank}
      </span>
      <span className="ranking__nombre">
        {fila.display_name}
        {esMia && <span className="ranking__vos">Vos</span>}
      </span>
      <span className="ranking__datos">
        <span>
          <strong>{numero.format(fila.score)}</strong> puntos
        </span>
        <small>{partidas(fila.games)}</small>
      </span>
    </li>
  );
}

/** Los rankings del día, la semana, el mes y de siempre, tal como los arma el servidor con los puntajes guardados. */
export function Ranking() {
  const [periodo, setPeriodo] = useState<PeriodoRanking>("day");
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);
  const [tardando, setTardando] = useState(false);
  const pestaniasRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let activo = true;
    setEstado({ tipo: "cargando" });
    pedirRanking(periodo, idDeDispositivo())
      .then((ranking) => activo && setEstado({ tipo: "listo", ranking }))
      .catch(() => activo && setEstado({ tipo: "error" }));
    // Si cambió el período mientras tanto, la respuesta vieja se descarta.
    return () => {
      activo = false;
    };
  }, [periodo, intento]);

  // Si carga lento, probablemente el servidor estaba dormido: se avisa para que no parezca que se colgó.
  const cargando = estado.tipo === "cargando";
  useEffect(() => {
    if (!cargando) {
      setTardando(false);
      return;
    }
    const temporizador = window.setTimeout(() => setTardando(true), 6000);
    return () => window.clearTimeout(temporizador);
  }, [cargando]);

  function alTeclear(evento: KeyboardEvent, indice: number) {
    const ultimo = PESTANIAS.length - 1;
    const destino =
      evento.key === "ArrowRight" ? (indice + 1) % PESTANIAS.length
      : evento.key === "ArrowLeft" ? (indice + ultimo) % PESTANIAS.length
      : evento.key === "Home" ? 0
      : evento.key === "End" ? ultimo
      : null;
    if (destino === null) return;
    evento.preventDefault();
    setPeriodo(PESTANIAS[destino].periodo);
    pestaniasRef.current[destino]?.focus();
  }

  const actual = PESTANIAS.find((p) => p.periodo === periodo)!;
  const ranking = estado.tipo === "listo" ? estado.ranking : null;
  const meEnLista = ranking?.me ? ranking.entries.some((e) => e.rank === ranking.me!.rank && e.display_name === ranking.me!.display_name) : false;

  return (
    <main className="ranking">
      <header className="ranking__cabecera">
        <h1>Ranking</h1>
        <p>Los mejores puntajes del juego diario. Cuantos menos intentos y más rápido, más puntos.</p>
      </header>

      <div className="ranking__pestanias" role="tablist" aria-label="Período del ranking">
        {PESTANIAS.map(({ periodo: valor, etiqueta }, indice) => (
          <button
            key={valor}
            ref={(nodo) => {
              pestaniasRef.current[indice] = nodo;
            }}
            type="button"
            role="tab"
            aria-selected={periodo === valor}
            tabIndex={periodo === valor ? 0 : -1}
            className={`ranking__pestania${periodo === valor ? " ranking__pestania--activa" : ""}`}
            onClick={() => setPeriodo(valor)}
            onKeyDown={(evento) => alTeclear(evento, indice)}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {estado.tipo === "cargando" && (
        <div className="ranking__mensaje">
          <p role="status">Cargando el ranking…</p>
          {tardando && <p className="ranking__espera">El servidor estaba dormido y está despertando. Puede tardar hasta un minuto.</p>}
        </div>
      )}

      {estado.tipo === "error" && (
        <div className="ranking__mensaje" role="alert">
          <p>No pudimos cargar el ranking. Revisá tu conexión e intentá de nuevo.</p>
          <button type="button" className="boton boton--violeta" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {ranking && (
        <section aria-live="polite">
          <p className="ranking__rotulo">{rotulo(ranking)}</p>

          {ranking.entries.length === 0 ? (
            <div className="ranking__vacio">
              <p>Todavía nadie guardó su puntaje {actual.periodo === "all" ? "" : actual.nombre}. ¡Podés ser la primera persona!</p>
              <Link href="/jugar" className="boton boton--grande boton--violeta">
                Jugar el diario
              </Link>
            </div>
          ) : (
            <ol className="ranking__lista" aria-label={`Ranking ${actual.nombre}`}>
              {ranking.entries.map((fila, indice) => (
                <Fila key={`${indice}-${fila.rank}-${fila.display_name}`} fila={fila} esMia={!!ranking.me && ranking.me.rank === fila.rank && ranking.me.display_name === fila.display_name} />
              ))}
            </ol>
          )}

          {/* Presumir el puesto de la escala que se está mirando (hoy, semana, mes o de siempre). */}
          {ranking.me && <BotonCompartirPosicion key={ranking.period} ranking={ranking} />}

          {ranking.me && !meEnLista && (
            <section className="ranking__tu-puesto" aria-label="Tu puesto">
              <h2>Tu puesto</h2>
              <ol className="ranking__lista">
                <Fila fila={ranking.me} esMia />
              </ol>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
