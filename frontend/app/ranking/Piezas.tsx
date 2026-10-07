import Link from "next/link";
import { BotonCompartirPosicion } from "../compartir/BotonCompartirPosicion";
import type { Destacados, EstadisticasGlobales, FilaRanking, RankingServidor } from "../lib/juego/tipos";
import { inicialDe } from "../ui/FotoDelArtista";

const numero = new Intl.NumberFormat("es-UY");
const TONOS = 5;
const tonoDe = (nombre: string) => [...nombre].reduce((suma, c) => suma + c.charCodeAt(0), 0) % TONOS;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const SIN_DATO = "—";
/** Cuántos jugadores muestra cada tarjeta de récords. */
const FILAS_DE_RECORD = 3;

/** La inicial del jugador sobre un color de la marca (los jugadores no tienen foto), siempre el mismo para el mismo nombre. */
export function AvatarDeJugador({ nombre }: { nombre: string }) {
  return (
    <span className={`avatar avatar--tono-${tonoDe(nombre)}`} aria-hidden="true">
      {inicialDe(nombre)}
    </span>
  );
}

function Corona() {
  return (
    <svg className="ranking__corona" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.2 3.4L12 4l4.8 7.4L21 8l-1.8 11H4.8Z" fill="currentColor" />
    </svg>
  );
}

const racha = (fila: FilaRanking) =>
  fila.current_streak === undefined ? (
    SIN_DATO
  ) : (
    <>
      <img src="/assets/streak-fire.svg" alt="" width={16} height={16} /> {fila.current_streak}
    </>
  );
const precision = (fila: FilaRanking) => (fila.win_percentage === undefined || fila.win_percentage === null ? SIN_DATO : `${fila.win_percentage}%`);
const canciones = (fila: FilaRanking) => numero.format(fila.played ?? fila.games);

/** La tabla de posiciones: puesto (con corona el primero), jugador, puntaje, racha, precisión y canciones. */
export function TablaDelRanking({ filas, me }: { filas: FilaRanking[]; me: FilaRanking | null }) {
  const esMia = (fila: FilaRanking) => !!me && me.rank === fila.rank && me.display_name === fila.display_name;
  return (
    <table className="ranking__tabla" aria-label="Ranking">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Jugador</th>
          <th scope="col">Puntaje</th>
          <th scope="col">Racha</th>
          <th scope="col">Precisión</th>
          <th scope="col">Canciones</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila, indice) => (
          <tr key={`${indice}-${fila.rank}-${fila.display_name}`} className={`ranking__fila${fila.rank <= 3 ? ` ranking__fila--top${fila.rank}` : ""}${esMia(fila) ? " ranking__fila--mia" : ""}`}>
            <td className="ranking__puesto" aria-label={`Puesto ${fila.rank}`}>
              {fila.rank === 1 ? <Corona /> : fila.rank}
            </td>
            <td className="ranking__jugador">
              <AvatarDeJugador nombre={fila.display_name} />
              <span className="ranking__nombre">{fila.display_name}</span>
              {esMia(fila) && <span className="ranking__vos">Vos</span>}
            </td>
            <td className="ranking__puntaje">{numero.format(fila.score)}</td>
            <td className="ranking__racha">{racha(fila)}</td>
            <td>{precision(fila)}</td>
            <td>{canciones(fila)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** El puesto propio en el ranking que se está mirando, con sus números y para compartirlo; sin puesto, una invitación a jugar. */
export function TuPosicion({ ranking }: { ranking: RankingServidor }) {
  const { me, players } = ranking;
  return (
    <section className="posicion" aria-label="Tu posición">
      <img className="posicion__flecha" src="/assets/flecha-posicion.svg" alt="" width={36} height={64} aria-hidden="true" />
      <h2>Tu posición</h2>
      {me ? (
        <>
          <div className="posicion__puesto">
            <AvatarDeJugador nombre={me.display_name} />
            <div>
              <strong>#{numero.format(me.rank)}</strong>
              {players !== undefined && players >= me.rank && <span>{`de ${numero.format(players)} ${plural(players, "jugador", "jugadores")}`}</span>}
            </div>
          </div>
          <dl className="posicion__numeros">
            <div><dt>Puntaje</dt><dd>{numero.format(me.score)}</dd></div>
            <div><dt>Racha</dt><dd>{me.current_streak ?? SIN_DATO}</dd></div>
            <div><dt>Precisión</dt><dd>{precision(me)}</dd></div>
            <div><dt>Canciones</dt><dd>{canciones(me)}</dd></div>
          </dl>
          <BotonCompartirPosicion ranking={ranking} />
        </>
      ) : (
        <>
          <p>Todavía no tenés puesto en este ranking. Jugá y guardá tu puntaje para aparecer.</p>
          <Link href="/jugar" className="boton boton--violeta">
            Jugar el diario
          </Link>
        </>
      )}
    </section>
  );
}

/** Una lista corta (mayor racha, mejor precisión, más canciones): los primeros con su valor. */
export function ListaDestacada({ titulo, filas, clase = "", icono, sufijo = "", adorno, vacio = "Todavía no hay datos." }: { titulo: string; filas: Destacados["streaks"]; clase?: string; icono?: string; sufijo?: string; adorno?: string; vacio?: string }) {
  return (
    <section className={`destacada ${clase}`.trim()} aria-label={titulo}>
      <h3>
        {icono && <img src={icono} alt="" width={30} height={30} aria-hidden="true" />}
        {titulo}
      </h3>
      {adorno && <img className="destacada__adorno" src={adorno} alt="" width={44} height={42} aria-hidden="true" />}
      {filas.length === 0 ? (
        <p className="destacada__vacia">{vacio}</p>
      ) : (
        <ol>
          {filas.slice(0, FILAS_DE_RECORD).map((fila, indice) => (
            <li key={`${indice}-${fila.display_name}`}>
              <span className="destacada__puesto">{indice + 1}</span>
              <AvatarDeJugador nombre={fila.display_name} />
              <span className="destacada__nombre">{fila.display_name}</span>
              <strong>{`${numero.format(fila.value)}${sufijo}`}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Las tres listas de récords, en fila bajo la tabla. Sin datos no aparece; un servidor anterior sin precisión deja dos. */
export function OtrosRecords({ datos }: { datos: Destacados | null }) {
  if (!datos) return null;
  return (
    <section className="records" aria-label="Otros récords">
      <h2 className="records__titulo">
        <span className="resaltado-titulo">Otros récords</span>
      </h2>
      <img className="records__rayitas" src="/assets/rayitas-records.svg" alt="" width={44} height={36} aria-hidden="true" />
      <div className="records__lista">
        <ListaDestacada titulo="Mayor racha" filas={datos.streaks} clase="destacada--racha" icono="/assets/icon-llama.svg" adorno="/assets/corona-trazo.svg" />
        {datos.accuracy && <ListaDestacada titulo="Mejor precisión" filas={datos.accuracy} clase="destacada--precision" icono="/assets/icon-diana.svg" sufijo="%" vacio="Jugá al menos 3 partidas para aparecer acá." />}
        <ListaDestacada titulo="Más canciones descubiertas" filas={datos.songs} clase="destacada--canciones" icono="/assets/icon-nota.svg" />
      </div>
    </section>
  );
}

/** Cómo se arma el puntaje, en un desplegable que viene abierto. El servidor da más puntos cuanto antes se acierta (menos intentos y menos tiempo). */
export function ComoSeCalculaElPuntaje() {
  return (
    <details className="como-puntaje" open>
      <summary>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6M12 7.5v.01" />
        </svg>
        ¿Cómo se calcula el puntaje?
      </summary>
      <p>Sumás más puntos cuanto antes descubrís una canción. La racha y la precisión se muestran aparte.</p>
    </details>
  );
}

const ICONO = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ICONOS_GLOBALES = {
  jugadores: (
    <svg width="34" height="34" viewBox="0 0 32 32" {...ICONO}>
      <circle cx="12" cy="11" r="4.5" />
      <path d="M3.5 26c.8-5 4-8 8.5-8s7.7 3 8.5 8" />
      <path d="M21 6.8a4.5 4.5 0 0 1 0 8.4M24 19c2.4 1 4 3.4 4.5 7" />
    </svg>
  ),
  partidas: (
    <svg width="34" height="34" viewBox="0 0 32 32" {...ICONO}>
      <path d="M12 23V8l14-3v15" />
      <circle cx="8.5" cy="23" r="3.5" />
      <circle cx="22.5" cy="20" r="3.5" />
    </svg>
  ),
  dias: (
    <svg width="34" height="34" viewBox="0 0 32 32" {...ICONO}>
      <rect x="4" y="7" width="24" height="21" rx="3" />
      <path d="M4 14h24M10 3.5V9M22 3.5V9" />
    </svg>
  ),
};

/** Tres cifras de todo el juego, en fila; sin datos no se muestra nada (nunca ceros inventados). */
export function EstadisticasGlobalesDelJuego({ datos }: { datos: EstadisticasGlobales | null }) {
  if (!datos) return null;
  const tarjetas = [
    { valor: datos.players, etiqueta: plural(datos.players, "jugador", "jugadores"), icono: ICONOS_GLOBALES.jugadores },
    { valor: datos.games, etiqueta: plural(datos.games, "partida jugada", "partidas jugadas"), icono: ICONOS_GLOBALES.partidas },
    { valor: datos.days, etiqueta: `${plural(datos.days, "canción", "canciones")} del diario`, icono: ICONOS_GLOBALES.dias },
  ];
  return (
    <section className="globales" aria-label="Estadísticas globales">
      <ul>
        {tarjetas.map(({ valor, etiqueta, icono }) => (
          <li key={etiqueta}>
            {icono}
            <div>
              <strong>{numero.format(valor)}</strong>
              <span>{etiqueta}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Para quien no tiene cuenta: aparecer en el ranking y guardar el progreso. */
export function LlamadoACuenta() {
  return (
    <section className="llamado" aria-labelledby="llamado-titulo">
      <div className="llamado__texto">
        <img src="/assets/icon-trophy.svg" alt="" width={44} height={44} aria-hidden="true" />
        <div>
          <h2 id="llamado-titulo">¿Querés aparecer en el ranking?</h2>
          <p>Iniciá sesión para guardar tu progreso y competir con otros jugadores.</p>
          <Link href="/login?modo=crear" className="boton boton--violeta">
            Crear cuenta →
          </Link>
        </div>
      </div>
      <img className="llamado__flan" src="/assets/flan_footer.webp" alt="" aria-hidden="true" width={260} height={260} />
      <p className="llamado__nota" aria-hidden="true">
        Jugá, sumá puntos y subí en el ranking.
      </p>
    </section>
  );
}

/** El encabezado: título grande, bajada, las cifras del juego y la ilustración del podio (decorativa). */
export function HeroDelRanking({ globales = null }: { globales?: EstadisticasGlobales | null }) {
  return (
    <section className="ranking-hero">
      <div>
        <p className="ranking-hero__etiqueta">Ranking global</p>
        <h1>
          ¿Quién sabe más <span className="ranking-hero__sin-corte">de música</span> <span className="ranking-hero__resaltado">uruguaya?</span>
        </h1>
        <p className="ranking-hero__bajada">Compará tu puntaje, racha y precisión con jugadores de todo el mundo.</p>
        <EstadisticasGlobalesDelJuego datos={globales} />
      </div>
      <div className="ranking-podio" aria-hidden="true">
        <img className="ranking-podio__mancha" src="/assets/ranking-mancha-podio.svg" alt="" />
        <img className="ranking-podio__dibujo" src="/assets/ranking-podio.webp" alt="" width={1120} height={806} />
      </div>
    </section>
  );
}
