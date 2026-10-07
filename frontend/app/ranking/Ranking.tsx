"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cuentasActivas } from "../lib/cuenta/activas";
import { useSesion } from "../lib/cuenta/useSesion";
import { idDeDispositivo } from "../lib/juego/dispositivo";
import { pedirDestacados, pedirGlobales, pedirRanking } from "../lib/juego/estadisticas-servidor";
import type { Destacados, EstadisticasGlobales, FilaRanking, PeriodoRanking, RankingServidor } from "../lib/juego/tipos";
import { FinDeLaLista } from "./FinDeLaLista";
import { ComoSeCalculaElPuntaje, HeroDelRanking, LlamadoACuenta, OtrosRecords, TablaDelRanking, TuPosicion } from "./Piezas";

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
  // La lista se va sumando de a una página al scrollear. `generacion` descarta lo que llega de un período que ya no se mira.
  const [filas, setFilas] = useState<FilaRanking[]>([]);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState(false);
  const generacion = useRef(0);
  const pidiendo = useRef(false);
  const [destacados, setDestacados] = useState<Destacados | null>(null);
  const [globales, setGlobales] = useState<EstadisticasGlobales | null>(null);
  const { sesion, lista } = useSesion();

  useEffect(() => {
    const mia = ++generacion.current;
    pidiendo.current = false;
    setEstado({ tipo: "cargando" });
    setFilas([]);
    setPagina(1);
    setHayMas(false);
    setCargandoMas(false);
    setErrorMas(false);
    pedirRanking(periodo, idDeDispositivo(), 1)
      .then((ranking) => {
        // Si cambió el período mientras tanto, la respuesta vieja se descarta.
        if (generacion.current !== mia) return;
        setEstado({ tipo: "listo", ranking });
        setFilas(ranking.entries);
        setHayMas(ranking.has_more === true);
      })
      .catch(() => generacion.current === mia && setEstado({ tipo: "error" }));
  }, [periodo, intento]);

  const traerMas = useCallback(async () => {
    if (pidiendo.current || !hayMas) return;
    pidiendo.current = true;
    const mia = generacion.current;
    const siguiente = pagina + 1;
    setCargandoMas(true);
    setErrorMas(false);
    try {
      const traida = await pedirRanking(periodo, idDeDispositivo(), siguiente);
      if (generacion.current !== mia) return;
      setFilas((antes) => [...antes, ...traida.entries]);
      setPagina(siguiente);
      setHayMas(traida.has_more === true);
    } catch {
      if (generacion.current === mia) setErrorMas(true);
    } finally {
      if (generacion.current === mia) {
        pidiendo.current = false;
        setCargandoMas(false);
      }
    }
  }, [hayMas, pagina, periodo]);

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
  const meEnLista = ranking?.me ? filas.some((e) => e.rank === ranking.me!.rank && e.display_name === ranking.me!.display_name) : false;

  return (
    <main className="ranking">
      <HeroDelRanking globales={globales} />

      <div className="ranking__controles">
        <h2 className="ranking__titulo">
          <span className="resaltado-titulo">Ranking</span>
        </h2>
        {selector}
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
      </div>
      {ranking && <p className="ranking__rotulo">{rotulo(ranking)}</p>}

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
              {filas.length === 0 ? (
                <div className="ranking__vacio">
                  <p>Todavía nadie guardó su puntaje {actual.periodo === "all" ? "" : actual.nombre}. ¡Podés ser la primera persona!</p>
                  <Link href="/jugar" className="boton boton--grande boton--violeta">
                    Jugar el diario
                  </Link>
                </div>
              ) : (
                <>
                  <TablaDelRanking filas={filas} me={ranking.me} />
                  <FinDeLaLista hayMas={hayMas} cargando={cargandoMas} error={errorMas} filas={filas.length} alVer={traerMas} />
                </>
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
          <ComoSeCalculaElPuntaje />
        </aside>
      </div>

      <OtrosRecords datos={destacados} />
      {cuentasActivas() && lista && !sesion && <LlamadoACuenta />}
    </main>
  );
}
