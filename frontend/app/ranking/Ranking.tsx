"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { cuentasActivas } from "../lib/cuenta/activas";
import { useSesion } from "../lib/cuenta/useSesion";
import { idDeDispositivo } from "../lib/juego/dispositivo";
import { pedirDestacados, pedirGlobales, pedirRanking } from "../lib/juego/estadisticas-servidor";
import type { Destacados, EstadisticasGlobales, PeriodoRanking, RankingServidor } from "../lib/juego/tipos";
import { EstadisticasGlobalesDelJuego, HeroDelRanking, ListaDestacada, LlamadoACuenta, TablaDelRanking, TuPosicion } from "./Piezas";

const PERIODOS: { periodo: PeriodoRanking; etiqueta: string; nombre: string }[] = [
  { periodo: "all", etiqueta: "Todo el tiempo", nombre: "de todos los tiempos" },
  { periodo: "day", etiqueta: "Hoy", nombre: "de hoy" },
  { periodo: "week", etiqueta: "Esta semana", nombre: "de esta semana" },
  { periodo: "month", etiqueta: "Este mes", nombre: "de este mes" },
];

type Estado = { tipo: "cargando" } | { tipo: "error" } | { tipo: "listo"; ranking: RankingServidor };

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

/**
 * La página del ranking: encabezado, el ranking del período elegido (puesto, puntaje, racha, precisión y canciones), tu
 * posición, las mejores rachas, quiénes jugaron más canciones, las estadísticas globales y, sin sesión, la invitación a crear
 * una cuenta. Todo lo calcula y guarda el servidor.
 */
export function Ranking({ selector }: { selector?: ReactNode } = {}) {
  const [periodo, setPeriodo] = useState<PeriodoRanking>("all");
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);
  const [tardando, setTardando] = useState(false);
  const [destacados, setDestacados] = useState<Destacados | null>(null);
  const [globales, setGlobales] = useState<EstadisticasGlobales | null>(null);
  const { sesion, lista } = useSesion();

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

  // Las listas laterales y las cifras globales no dependen del período: se piden una vez, y si fallan simplemente no se muestran.
  useEffect(() => {
    let activo = true;
    pedirDestacados().then((d) => activo && setDestacados(d)).catch(() => {});
    pedirGlobales().then((g) => activo && setGlobales(g)).catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

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

  const actual = PERIODOS.find((p) => p.periodo === periodo)!;
  const ranking = estado.tipo === "listo" ? estado.ranking : null;
  const meEnLista = ranking?.me ? ranking.entries.some((e) => e.rank === ranking.me!.rank && e.display_name === ranking.me!.display_name) : false;

  return (
    <main className="ranking">
      <HeroDelRanking />
      {selector}

      <div className="ranking__controles">
        <label className="ranking__periodo">
          <span className="solo-lectores">Período</span>
          <select value={periodo} onChange={(evento) => setPeriodo(evento.target.value as PeriodoRanking)}>
            {PERIODOS.map(({ periodo: valor, etiqueta }) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        {ranking && <p className="ranking__rotulo">{rotulo(ranking)}</p>}
      </div>

      <div className="ranking__cuerpo">
        <div className="ranking__principal" aria-live="polite">
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
            <>
              {ranking.entries.length === 0 ? (
                <div className="ranking__vacio">
                  <p>Todavía nadie guardó su puntaje {actual.periodo === "all" ? "" : actual.nombre}. ¡Podés ser la primera persona!</p>
                  <Link href="/jugar" className="boton boton--grande boton--violeta">
                    Jugar el diario
                  </Link>
                </div>
              ) : (
                <TablaDelRanking filas={ranking.entries} me={ranking.me} />
              )}

              {ranking.me && !meEnLista && (
                <section className="ranking__tu-puesto" aria-label="Tu puesto">
                  <h2>Tu puesto</h2>
                  <TablaDelRanking filas={[ranking.me]} me={ranking.me} />
                </section>
              )}
            </>
          )}
        </div>

        <aside className="ranking__lateral">
          {ranking && <TuPosicion ranking={ranking} />}
          {destacados && <ListaDestacada titulo="Mejores rachas" filas={destacados.streaks} clase="destacada--racha" />}
          {destacados && <ListaDestacada titulo="Más canciones" filas={destacados.songs} clase="destacada--canciones" />}
        </aside>
      </div>

      <EstadisticasGlobalesDelJuego datos={globales} />
      {cuentasActivas() && lista && !sesion && <LlamadoACuenta />}
    </main>
  );
}
