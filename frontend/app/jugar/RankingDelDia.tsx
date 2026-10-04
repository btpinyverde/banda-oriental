"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EVENTO_HISTORIAL } from "../lib/juego/almacen-historial";
import { idDeDispositivo } from "../lib/juego/dispositivo";
import { pedirRanking } from "../lib/juego/estadisticas-servidor";
import type { FilaRanking, RankingServidor } from "../lib/juego/tipos";
import "./ranking-del-dia.css";

const FILAS = 5;
const numero = new Intl.NumberFormat("es-UY");

type Estado = { tipo: "cargando" } | { tipo: "error" } | { tipo: "listo"; ranking: RankingServidor };

function Fila({ fila, esMia, ...resto }: { fila: FilaRanking; esMia: boolean } & { "data-testid"?: string }) {
  return (
    <li className={`lateral__fila${esMia ? " lateral__fila--yo" : ""}`} {...resto}>
      <span className="lateral__puesto">{fila.rank}</span>
      <span className="lateral__avatar" aria-hidden="true">
        {(fila.display_name[0] ?? "?").toUpperCase()}
      </span>
      <span className="lateral__nombre">
        {fila.display_name}
        {esMia && <span className="lateral__vos"> Vos</span>}
      </span>
      <span className="lateral__aciertos">{numero.format(fila.score)} pts</span>
    </li>
  );
}

/** El ranking del día de verdad, tal como lo arma el servidor con los puntajes guardados (los cinco primeros y, si está fuera, tu puesto). */
export function RankingDelDia() {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const ultimoPedido = useRef(0);

  function traer() {
    const pedido = ++ultimoPedido.current;
    pedirRanking("day", idDeDispositivo())
      .then((ranking) => {
        // Solo vale la respuesta del pedido más reciente.
        if (pedido === ultimoPedido.current) setEstado({ tipo: "listo", ranking });
      })
      .catch(() => {
        if (pedido === ultimoPedido.current) setEstado((actual) => (actual.tipo === "listo" ? actual : { tipo: "error" }));
      });
  }

  useEffect(() => {
    traer();
    // Cuando se guarda un puntaje (o termina una partida) el ranking cambia: se vuelve a pedir.
    window.addEventListener(EVENTO_HISTORIAL, traer);
    return () => {
      ultimoPedido.current = Number.MAX_SAFE_INTEGER; // lo que llegue después de desmontar no se usa
      window.removeEventListener(EVENTO_HISTORIAL, traer);
    };
  }, []);

  const mia = estado.tipo === "listo" ? estado.ranking.me : null;
  const top = estado.tipo === "listo" ? estado.ranking.entries.slice(0, FILAS) : [];
  const estaEntreLasPrimeras = mia !== null && top.some((f) => f.rank === mia.rank && f.display_name === mia.display_name);

  return (
    <section aria-labelledby="lateral-ranking" aria-busy={estado.tipo === "cargando"}>
      <div className="lateral__cabecera">
        <h2 id="lateral-ranking" className="lateral__titulo">
          Ranking del día
        </h2>
        <Link href="/ranking" className="lateral__ver-todos">
          Ver todos →
        </Link>
      </div>

      {estado.tipo === "cargando" && (
        <div className="lateral__ranking-esqueleto" aria-hidden="true">
          {Array.from({ length: FILAS }, (_, i) => (
            <span key={i} className="esqueleto__bloque" />
          ))}
        </div>
      )}

      {estado.tipo === "error" && (
        <div className="lateral__ranking-vacio" role="alert">
          <p>No pudimos cargar el ranking.</p>
          <button type="button" className="boton boton--claro" onClick={traer}>
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === "listo" && top.length === 0 && (
        <p className="lateral__ranking-vacio">Todavía nadie guardó su puntaje hoy. ¡Sé el primero!</p>
      )}

      {estado.tipo === "listo" && top.length > 0 && (
        <>
          <ol className="lateral__ranking" aria-label="Ranking del día">
            {top.map((fila) => (
              <Fila key={`${fila.rank}-${fila.display_name}`} fila={fila} esMia={mia !== null && estaEntreLasPrimeras && fila.rank === mia.rank && fila.display_name === mia.display_name} />
            ))}
          </ol>
          {mia && !estaEntreLasPrimeras && (
            <ol className="lateral__ranking lateral__ranking--mio">
              <Fila fila={mia} esMia data-testid="mi-puesto" />
            </ol>
          )}
        </>
      )}
    </section>
  );
}
