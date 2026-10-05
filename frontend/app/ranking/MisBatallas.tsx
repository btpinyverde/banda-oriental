"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { crearApiBatallas, type ApiBatallas, type BatallaResumen, type FilaRanking } from "../lib/batallas/api-batallas";
import { HeroDelRanking } from "./Piezas";

type Estado = { tipo: "cargando" } | { tipo: "error" } | { tipo: "listo"; batallas: BatallaResumen[] };

const fecha = (iso: string) => new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

/**
 * Las batallas en las que la persona jugó o que organizó, cada una con su propio ranking. Es privado: la API solo devuelve
 * (y solo abre) las batallas de quien consulta, así que acá no hay nada que filtrar ni ranking general que mostrar.
 */
export function MisBatallas({ api, selector }: { api?: ApiBatallas; selector?: ReactNode }) {
  const cliente = useMemo(() => api ?? crearApiBatallas(), [api]);
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Record<string, FilaRanking[] | "error">>({});

  useEffect(() => {
    let activo = true;
    setEstado({ tipo: "cargando" });
    cliente
      .mias()
      .then((batallas) => activo && setEstado({ tipo: "listo", batallas }))
      .catch(() => activo && setEstado({ tipo: "error" }));
    return () => {
      activo = false;
    };
  }, [cliente, intento]);

  async function abrir(code: string) {
    setAbierta(abierta === code ? null : code);
    if (rankings[code]) return;
    try {
      const r = await cliente.estado(code);
      setRankings((previo) => ({ ...previo, [code]: "ranking" in r && r.ranking ? r.ranking : "error" }));
    } catch {
      setRankings((previo) => ({ ...previo, [code]: "error" }));
    }
  }

  return (
    <main className="ranking">
      <HeroDelRanking />
      {selector}
      <div className="ranking__cuerpo">
        <div className="ranking__principal" aria-live="polite">
          {estado.tipo === "cargando" && <p role="status">Cargando tus batallas…</p>}

          {estado.tipo === "error" && (
            <div className="ranking__mensaje" role="alert">
              <p>No pudimos cargar tus batallas. Revisá tu conexión e intentá de nuevo.</p>
              <button type="button" className="boton boton--violeta" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          )}

          {estado.tipo === "listo" && estado.batallas.length === 0 && (
            <div className="ranking__vacio">
              <p>Todavía no jugaste ninguna batalla.</p>
              <Link href="/batalla" className="boton boton--grande boton--violeta">
                Crear una batalla
              </Link>
            </div>
          )}

          {estado.tipo === "listo" && estado.batallas.length > 0 && (
            <ul className="mis-batallas">
              {estado.batallas.map((b) => {
                const nombre = b.title || `Batalla ${b.code}`;
                const detalle = `${fecha(b.created_at)} · ${b.players_count} ${b.players_count === 1 ? "jugador" : "jugadores"} · ${
                  b.role === "host" ? "la organizaste" : b.my_position ? `quedaste ${b.my_position}.º` : "jugaste"
                }`;
                const ranking = rankings[b.code];
                return (
                  <li key={b.code} className="mis-batallas__item">
                    {b.status === "finished" ? (
                      <button type="button" className="mis-batallas__boton" aria-expanded={abierta === b.code} onClick={() => abrir(b.code)}>
                        <span className="mis-batallas__nombre">{nombre}</span>
                        <span className="mis-batallas__detalle">{detalle}</span>
                      </button>
                    ) : (
                      <Link href={`/batalla/${b.code}`} className="mis-batallas__boton">
                        <span className="mis-batallas__nombre">{nombre}</span>
                        <span className="mis-batallas__detalle">{b.status === "lobby" ? "Esperando que empiece" : "En juego"} · {b.players_count} jugadores</span>
                      </Link>
                    )}
                    {abierta === b.code && ranking === "error" && <p role="alert">No pudimos abrir esta batalla.</p>}
                    {abierta === b.code && Array.isArray(ranking) && (
                      <table className="mis-batallas__tabla">
                        <thead>
                          <tr>
                            <th>Puesto</th>
                            <th>Jugador</th>
                            <th>Puntos</th>
                            <th>Aciertos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranking.map((fila) => (
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
