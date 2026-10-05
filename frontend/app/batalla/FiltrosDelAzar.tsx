"use client";

import { useEffect, useState } from "react";
import type { FiltrosAzar } from "../lib/batallas/api-batallas";

interface Props {
  valor: FiltrosAzar;
  alCambiar: (filtros: FiltrosAzar) => void;
  /** Los géneros que tiene el catálogo, para elegir. */
  generos: string[];
  /** Busca artistas del catálogo por nombre. */
  buscarArtistas: (texto: string) => Promise<{ id: number; name: string }[]>;
  /** Cuántas canciones cumplen los filtros (null mientras se cuenta). */
  cantidad: number | null;
  /** Cuántas canciones pide la batalla: si hay menos, se avisa. */
  pedidas: number;
}

const TIPOS: { valor: string; incluir: string; excluir: string }[] = [
  { valor: "album", incluir: "Incluir álbumes", excluir: "Excluir álbumes" },
  { valor: "ep", incluir: "Incluir EP", excluir: "Excluir EP" },
  { valor: "single", incluir: "Incluir singles", excluir: "Excluir singles" },
];

const numero = (texto: string): number | undefined => {
  if (texto.trim() === "") return undefined;
  const n = Number(texto);
  return Number.isFinite(n) ? n : undefined;
};

/** Saca de los filtros todo lo que quedó vacío: un filtro vacío no filtra y no se manda. */
function limpiar(filtros: FiltrosAzar): FiltrosAzar {
  const sinVacios = <T extends object>(objeto: T): T =>
    Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as T;
  return { include: sinVacios(filtros.include), exclude: sinVacios(filtros.exclude) };
}

const alternar = <T,>(lista: T[] | undefined, valor: T): T[] => {
  const actual = lista ?? [];
  return actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor];
};

/**
 * Cómo se acotan las canciones que salen al azar: lo que se incluye y lo que se excluye (años, géneros, artistas, tipo de
 * disco, duración). Es un componente controlado: la pantalla de crear guarda los filtros y pregunta cuántas canciones quedan.
 */
export function FiltrosDelAzar({ valor, alCambiar, generos, buscarArtistas, cantidad, pedidas }: Props) {
  const [texto, setTexto] = useState("");
  const [encontrados, setEncontrados] = useState<{ id: number; name: string }[]>([]);
  const [nombres, setNombres] = useState<Record<number, string>>({});
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [errorRango, setErrorRango] = useState<string | null>(null);

  const cambiar = (hacer: (copia: FiltrosAzar) => void) => {
    const copia: FiltrosAzar = JSON.parse(JSON.stringify(valor));
    hacer(copia);
    alCambiar(limpiar(copia));
  };

  // Busca artistas mientras se escribe, sin pedir en cada letra.
  useEffect(() => {
    if (texto.trim().length < 2) {
      setEncontrados([]);
      return;
    }
    let activo = true;
    const espera = setTimeout(() => {
      buscarArtistas(texto.trim())
        .then((lista) => {
          if (!activo) return;
          setEncontrados(lista);
          setNombres((previo) => ({ ...previo, ...Object.fromEntries(lista.map((a) => [a.id, a.name])) }));
        })
        .catch(() => activo && setEncontrados([]));
    }, 250);
    return () => {
      activo = false;
      clearTimeout(espera);
    };
  }, [texto, buscarArtistas]);

  const agregarRango = () => {
    const a = numero(desde);
    const b = numero(hasta);
    if (a === undefined || b === undefined || a > b) {
      setErrorRango("Poné un desde y un hasta, y el desde tiene que ser menor o igual que el hasta.");
      return;
    }
    setErrorRango(null);
    cambiar((f) => {
      f.exclude.years = [...(f.exclude.years ?? []), [a, b]];
    });
    setDesde("");
    setHasta("");
  };

  const inc = valor.include;
  const exc = valor.exclude;
  const nombreDe = (id: number) => nombres[id] ?? `Artista ${id}`;

  return (
    <div className="batalla__filtros" role="group" aria-label="Filtros de las canciones">
      <p className="batalla__nota">Elegí de qué canciones puede salir el azar. Lo que no completes no filtra.</p>

      <div className="batalla__fila">
        <label className="batalla__campo">
          Años desde
          <input inputMode="numeric" value={inc.year_from ?? ""} onChange={(e) => cambiar((f) => void (f.include.year_from = numero(e.target.value)))} />
        </label>
        <label className="batalla__campo">
          Años hasta
          <input inputMode="numeric" value={inc.year_to ?? ""} onChange={(e) => cambiar((f) => void (f.include.year_to = numero(e.target.value)))} />
        </label>
      </div>

      <div className="batalla__fila">
        <label className="batalla__campo">
          Duración mínima (segundos)
          <input inputMode="numeric" value={inc.duration_min ?? ""} onChange={(e) => cambiar((f) => void (f.include.duration_min = numero(e.target.value)))} />
        </label>
        <label className="batalla__campo">
          Duración máxima (segundos)
          <input inputMode="numeric" value={inc.duration_max ?? ""} onChange={(e) => cambiar((f) => void (f.include.duration_max = numero(e.target.value)))} />
        </label>
      </div>

      {(["incluir", "excluir"] as const).map((modo) => {
        const lista = (modo === "incluir" ? inc.genres : exc.genres) ?? [];
        return (
          <div key={modo} className="batalla__campo">
            <span>{modo === "incluir" ? "Solo de estos géneros" : "Sin estos géneros"}</span>
            <select
              aria-label={`Agregar género a ${modo}`}
              value=""
              onChange={(e) => {
                const genero = e.target.value;
                if (!genero) return;
                cambiar((f) => {
                  const destino = modo === "incluir" ? f.include : f.exclude;
                  const actual = destino.genres ?? [];
                  destino.genres = actual.includes(genero) ? actual : [...actual, genero];
                });
              }}
            >
              <option value="">Agregar género…</option>
              {generos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <ul className="batalla__etiquetas">
              {lista.map((g) => (
                <li key={g}>
                  {g}
                  <button type="button" aria-label={`Quitar ${g} de los géneros ${modo === "incluir" ? "incluidos" : "excluidos"}`} onClick={() => cambiar((f) => void ((modo === "incluir" ? f.include : f.exclude).genres = alternar(lista, g)))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="batalla__campo">
        <label>
          Buscar artista
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="La Vela Puerca…" />
        </label>
        {encontrados.length > 0 && (
          <ul className="batalla__resultados">
            {encontrados.map((a) => (
              <li key={a.id}>
                {a.name}
                <button type="button" className="batalla__mini" aria-label={`Incluir a ${a.name}`} onClick={() => cambiar((f) => void (f.include.artists = [...new Set([...(f.include.artists ?? []), a.id])]))}>
                  Incluir
                </button>
                <button type="button" className="batalla__mini batalla__mini--no" aria-label={`Sacar a ${a.name}`} onClick={() => cambiar((f) => void (f.exclude.artists = [...new Set([...(f.exclude.artists ?? []), a.id])]))}>
                  Sacar
                </button>
              </li>
            ))}
          </ul>
        )}
        {(["incluidos", "excluidos"] as const).map((grupo) => {
          const ids = (grupo === "incluidos" ? inc.artists : exc.artists) ?? [];
          if (ids.length === 0) return null;
          return (
            <div key={grupo}>
              <span className="batalla__nota">{grupo === "incluidos" ? "Solo de estos artistas" : "Sin estos artistas"}</span>
              <ul className="batalla__etiquetas">
                {ids.map((id) => (
                  <li key={id}>
                    {nombreDe(id)}
                    <button type="button" aria-label={`Quitar a ${nombreDe(id)} de los ${grupo}`} onClick={() => cambiar((f) => void ((grupo === "incluidos" ? f.include : f.exclude).artists = ids.filter((x) => x !== id)))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <fieldset className="batalla__opciones">
        <legend>Tipo de disco</legend>
        {TIPOS.map((tipo) => (
          <div key={tipo.valor} className="batalla__fila">
            <label>
              <input type="checkbox" checked={!!inc.release_types?.includes(tipo.valor)} onChange={() => cambiar((f) => void (f.include.release_types = alternar(f.include.release_types, tipo.valor)))} />
              {tipo.incluir}
            </label>
            <label>
              <input type="checkbox" checked={!!exc.release_types?.includes(tipo.valor)} onChange={() => cambiar((f) => void (f.exclude.release_types = alternar(f.exclude.release_types, tipo.valor)))} />
              {tipo.excluir}
            </label>
          </div>
        ))}
      </fieldset>

      <div className="batalla__campo">
        <span>Rangos de años a excluir</span>
        <div className="batalla__fila">
          <label className="batalla__campo">
            Excluir años desde
            <input inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="batalla__campo">
            Excluir años hasta
            <input inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <button type="button" className="batalla__mini" onClick={agregarRango}>
            Agregar rango a excluir
          </button>
        </div>
        {errorRango && (
          <p className="batalla__error" role="alert">
            {errorRango}
          </p>
        )}
        <ul className="batalla__etiquetas">
          {(exc.years ?? []).map(([a, b]) => (
            <li key={`${a}-${b}`}>
              {a} a {b}
              <button type="button" aria-label={`Quitar el rango ${a} a ${b}`} onClick={() => cambiar((f) => void (f.exclude.years = (f.exclude.years ?? []).filter(([x, y]) => !(x === a && y === b))))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="batalla__nota" aria-live="polite">
        {cantidad === null ? "Contando canciones…" : `Hay ${cantidad} canciones que cumplen.`}
        {cantidad !== null && cantidad < pedidas && ` No alcanzan para ${pedidas} canciones: ampliá la selección o pedí menos.`}
      </p>
      <button type="button" className="batalla__mini batalla__mini--no" onClick={() => alCambiar({ include: {}, exclude: {} })}>
        Limpiar filtros
      </button>
    </div>
  );
}
