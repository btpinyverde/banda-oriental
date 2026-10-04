"use client";

import Link from "next/link";
import { BotonCompartir } from "../compartir/BotonCompartir";
import { datosDePartida } from "../lib/compartir/story";
import { cuentasActivas } from "../lib/cuenta/activas";
import { useSesion } from "../lib/cuenta/useSesion";
import { estadisticas, promedioIntentos, ultimosDias, type EstadoDia } from "../lib/juego/historial";
import { useDiaActual } from "../lib/juego/useDiaActual";
import { useEstadisticasServidor } from "../lib/juego/useEstadisticasServidor";
import { useHistorial } from "../lib/juego/useHistorial";
import { Ondulada } from "../ui/Ondulada";
import { RankingEjemplo } from "./RankingEjemplo";

const DIAS_RACHA = 5;

const TEXTO_DIA: Record<EstadoDia, string> = {
  ganada: "ganaste",
  perdida: "no salió",
  "sin-jugar": "sin jugar",
  pendiente: "hoy todavía por jugar",
};

const coma = (numero: number) => String(numero).replace(".", ",");

/**
 * Columna derecha de /jugar: la racha y las estadísticas de quien juega. Las cifras son las que calculó y guardó el
 * servidor; si no responde, se muestran las que salen de lo guardado en este dispositivo. Los cinco puntos de los
 * últimos días salen siempre del dispositivo. El ranking de ejemplo solo se muestra en el modo demo.
 */
export function ColumnaLateral({ conRankingEjemplo = false }: { conRankingEjemplo?: boolean }) {
  const historial = useHistorial();
  const hoy = useDiaActual();

  const delServidor = useEstadisticasServidor();
  const { sesion, lista: sesionLeida } = useSesion();

  const local = estadisticas(historial, hoy);
  const stats = delServidor
    ? {
        jugadas: delServidor.played,
        porcentaje: delServidor.win_percentage,
        rachaActual: delServidor.current_streak,
        rachaMaxima: delServidor.max_streak,
      }
    : local;
  const promedio = delServidor ? delServidor.average_attempts : promedioIntentos(local.distribucion);
  const sugerirCuenta = cuentasActivas() && sesionLeida && !sesion && stats.jugadas > 0;
  const dias = ultimosDias(historial, hoy, DIAS_RACHA);

  // Compartir el resultado de hoy: solo si ya se jugó y se guardaron los colores de los intentos para dibujarlo.
  const partidaDeHoy = historial.find((p) => p.dia === hoy);
  const datosParaCompartir = partidaDeHoy && datosDePartida(partidaDeHoy, false);

  const datos = [
    { valor: String(stats.jugadas), etiqueta: "jugadas" },
    { valor: stats.porcentaje === null ? "—" : `${stats.porcentaje}%`, etiqueta: "aciertos" },
    { valor: String(stats.rachaMaxima), etiqueta: "racha máx." },
    { valor: promedio === null ? "—" : coma(promedio), etiqueta: "intentos promedio", destacado: true },
  ];

  return (
    <aside className="lateral">
      <section className="lateral__racha" aria-labelledby="lateral-racha">
        <img src="/assets/streak-fire.svg" alt="" width={56} height={56} />
        <div>
          <h2 id="lateral-racha" className="lateral__subtitulo">
            Racha actual
          </h2>
          <p className="lateral__dias">{stats.rachaActual === 1 ? "1 día" : `${stats.rachaActual} días`}</p>
          <p className="lateral__puntos" aria-hidden="true">
            {dias.map(({ dia, estado }) => (
              <span key={dia} className={`lateral__punto--${estado}`} />
            ))}
          </p>
          <p className="solo-lectores">Últimos {DIAS_RACHA} días: {dias.map((d) => TEXTO_DIA[d.estado]).join(", ")}.</p>
          {stats.jugadas === 0 && <p className="lateral__invitacion">Jugá hoy para empezar tu racha.</p>}
        </div>
      </section>

      <section aria-labelledby="lateral-estadisticas">
        <h2 id="lateral-estadisticas" className="lateral__titulo">
          Mis estadísticas <small>(modo diario)</small>
        </h2>
        <ul className="lateral__estadisticas">
          {datos.map(({ valor, etiqueta, destacado }) => (
            <li key={etiqueta} className={`lateral__dato${destacado ? " lateral__dato--destacado" : ""}`}>
              <strong>{valor}</strong>
              <span>{etiqueta}</span>
            </li>
          ))}
        </ul>
        <Link href="/historial" className="lateral__ver-historial">
          Ver historial →
        </Link>
      </section>

      {sugerirCuenta && (
        <section className="lateral__aviso-cuenta" aria-label="Crear una cuenta">
          <p>
            <strong>Creá tu cuenta para no perder tu racha.</strong> Si pasás una semana sin jugar, tu historial sin
            cuenta se borra.
          </p>
          <Link href="/login" className="boton boton--violeta">
            Crear mi cuenta
          </Link>
        </section>
      )}

      {datosParaCompartir && <BotonCompartir datos={datosParaCompartir} />}

      {conRankingEjemplo && (
        <>
          <Ondulada className="lateral__divisor" />
          <RankingEjemplo />
        </>
      )}
    </aside>
  );
}
