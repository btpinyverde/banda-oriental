import Link from "next/link";
import { BotonCompartirPosicion } from "../compartir/BotonCompartirPosicion";
import type { Destacados, EstadisticasGlobales, FilaRanking, RankingServidor } from "../lib/juego/tipos";
import { inicialDe } from "../ui/FotoDelArtista";

const numero = new Intl.NumberFormat("es-UY");
const TONOS = 5;
const tonoDe = (nombre: string) => [...nombre].reduce((suma, c) => suma + c.charCodeAt(0), 0) % TONOS;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const SIN_DATO = "—";

/** La inicial del jugador sobre un color de la marca (los jugadores no tienen foto), siempre el mismo para el mismo nombre. */
export function AvatarDeJugador({ nombre }: { nombre: string }) {
  return (
    <span className={`avatar avatar--tono-${tonoDe(nombre)}`} aria-hidden="true">
      {inicialDe(nombre)}
    </span>
  );
}

function Corona({ puesto }: { puesto: 1 | 2 | 3 }) {
  return (
    <svg className={`ranking__corona ranking__corona--${puesto}`} width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
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

/** La tabla de posiciones: puesto (con corona los tres primeros), jugador, puntaje, racha, precisión y canciones. */
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
              {fila.rank <= 3 ? <Corona puesto={fila.rank as 1 | 2 | 3} /> : fila.rank}
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

/** Una lista corta (mejores rachas, más canciones): los cinco primeros con su valor. */
export function ListaDestacada({ titulo, filas, clase = "" }: { titulo: string; filas: Destacados["streaks"]; clase?: string }) {
  return (
    <section className={`destacada ${clase}`.trim()} aria-label={titulo}>
      <h2>{titulo}</h2>
      {filas.length === 0 ? (
        <p className="destacada__vacia">Todavía no hay datos.</p>
      ) : (
        <ol>
          {filas.map((fila, indice) => (
            <li key={`${indice}-${fila.display_name}`}>
              <span className="destacada__puesto">{indice + 1}</span>
              <AvatarDeJugador nombre={fila.display_name} />
              <span className="destacada__nombre">{fila.display_name}</span>
              <strong>{numero.format(fila.value)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Tres cifras de todo el juego; sin datos no se muestra nada (nunca ceros inventados). */
export function EstadisticasGlobalesDelJuego({ datos }: { datos: EstadisticasGlobales | null }) {
  if (!datos) return null;
  const tarjetas = [
    { valor: datos.players, etiqueta: plural(datos.players, "jugador", "jugadores"), icono: "/assets/icon-trophy.svg" },
    { valor: datos.games, etiqueta: plural(datos.games, "partida", "partidas"), icono: "/assets/music-note.svg" },
    { valor: datos.days, etiqueta: `${plural(datos.days, "canción", "canciones")} del diario`, icono: "/assets/calendar-today.svg" },
  ];
  return (
    <section className="globales" aria-label="Estadísticas globales">
      <h2>Estadísticas globales</h2>
      <ul>
        {tarjetas.map(({ valor, etiqueta, icono }) => (
          <li key={icono}>
            <img src={icono} alt="" width={44} height={44} />
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
          <Link href="/login" className="boton boton--violeta">
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

/** El encabezado: título grande, bajada y el collage con el trofeo (decorativo). */
export function HeroDelRanking() {
  return (
    <section className="ranking-hero">
      <div>
        <p className="ranking-hero__etiqueta">Ranking global</p>
        <h1>
          ¿Quién sabe más de música <span className="ranking-hero__resaltado">uruguaya?</span>
        </h1>
        <p className="ranking-hero__bajada">Compará tu puntaje, racha y precisión con jugadores de todo el mundo.</p>
      </div>
      <div className="ranking-colage" aria-hidden="true">
        <img className="ranking-colage__mancha" src="/assets/hero-blob-yellow.svg" alt="" />
        <figure className="ranking-colage__foto">
          <img src="/assets/hero-foto-salvo.webp" alt="" width={560} height={560} />
        </figure>
        <div className="ranking-colage__copa">
          <img src="/assets/trophy.svg" alt="" width={200} height={200} />
          <span>#1</span>
        </div>
        <div className="ranking-colage__nota">
          <span>Del rock</span>
          <span>al candombe,</span>
          <span>acá también</span>
          <span>se compite.</span>
        </div>
        <svg className="ranking-colage__estrella" viewBox="0 0 120 120" fill="none">
          <polygon fill="currentColor" points="117,60 101.5,71.1 109.4,88.5 90.4,90.4 88.5,109.4 71.1,101.5 60,117 48.9,101.5 31.5,109.4 29.6,90.4 10.6,88.5 18.5,71.1 3,60 18.5,48.9 10.6,31.5 29.6,29.6 31.5,10.6 48.9,18.5 60,3 71.1,18.5 88.5,10.6 90.4,29.6 109.4,31.5 101.5,48.9" />
        </svg>
      </div>
    </section>
  );
}
