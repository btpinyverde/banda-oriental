"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ESPERA_MS = 350;
const ORDENES = [
  { valor: "title", etiqueta: "Ordenar por" }, // lo de siempre: por título, de la A a la Z
  { valor: "artist", etiqueta: "Artista (A–Z)" },
  { valor: "newest", etiqueta: "Más nuevas" },
  { valor: "oldest", etiqueta: "Más antiguas" },
];

const nombreDeDecada = (decada: number) => `Años ${decada < 2000 ? decada - 1900 : decada}`;

interface Props {
  q: string;
  decada: string;
  orden: string;
  decadas: number[];
  /** El género elegido y los que se pueden elegir (los del catálogo). Sin géneros no hay selector. */
  genero?: string;
  generos?: string[];
  /** Los otros filtros puestos (género, vista…): se conservan al buscar. */
  parametros: Record<string, string>;
}

/** La barra del archivo: buscador (busca al dejar de escribir), década y orden. Todo queda en la dirección, así se puede compartir. */
export function BarraDeFiltros({ q, decada, orden, decadas, genero = "", generos = [], parametros }: Props) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const ultimaBuscada = useRef(q);

  const direccion = (cambios: { q?: string; decada?: string; orden?: string; genero?: string }) => {
    const busqueda = new URLSearchParams(Object.entries(parametros).filter(([clave]) => clave !== "pagina"));
    const nuevo = { q, decada, orden, genero, ...cambios };
    if (nuevo.genero) busqueda.set("genero", nuevo.genero);
    if (nuevo.q.trim()) busqueda.set("q", nuevo.q.trim().replace(/\s+/g, " "));
    if (nuevo.decada) busqueda.set("decada", nuevo.decada);
    if (nuevo.orden && nuevo.orden !== "title") busqueda.set("orden", nuevo.orden);
    const resto = busqueda.toString();
    return resto ? `/archivo?${resto}` : "/archivo";
  };

  // Busca cuando se deja de escribir; reemplaza la dirección en vez de agregar una por cada búsqueda al historial.
  useEffect(() => {
    const limpio = texto.trim().replace(/\s+/g, " ");
    if (limpio === ultimaBuscada.current.trim().replace(/\s+/g, " ")) return;
    const temporizador = window.setTimeout(() => {
      ultimaBuscada.current = texto;
      router.replace(direccion({ q: texto }), { scroll: false });
    }, ESPERA_MS);
    return () => window.clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <form
      className="barra"
      action="/archivo"
      method="get"
      role="search"
      onSubmit={(evento) => {
        evento.preventDefault();
        ultimaBuscada.current = texto;
        router.push(direccion({ q: texto }), { scroll: false });
      }}
    >
      {Object.entries(parametros)
        .filter(([clave]) => clave !== "pagina")
        .map(([clave, valor]) => (
          <input key={clave} type="hidden" name={clave} value={valor} />
        ))}
      <label className="barra__buscador">
        <span className="solo-lectores">Buscar en el archivo</span>
        <svg className="barra__lupa" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input type="search" name="q" value={texto} onChange={(evento) => setTexto(evento.target.value)} placeholder="Buscar canción, artista o disco…" maxLength={100} autoComplete="off" />
      </label>
      <label className="barra__selector">
        <span className="solo-lectores">Década</span>
        <select name="decada" value={decada} onChange={(evento) => router.push(direccion({ decada: evento.target.value }), { scroll: false })}>
          <option value="">Décadas</option>
          {decadas.map((d) => (
            <option key={d} value={d}>
              {nombreDeDecada(d)}
            </option>
          ))}
        </select>
      </label>
      {generos.length > 0 && (
        <label className="barra__selector">
          <span className="solo-lectores">Géneros</span>
          <select id="filtro-generos" name="genero" value={genero} onChange={(evento) => router.push(direccion({ genero: evento.target.value }), { scroll: false })}>
            <option value="">Géneros</option>
            {[...new Set(genero && !generos.includes(genero) ? [...generos, genero] : generos)].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="barra__selector">
        <span className="solo-lectores">Ordenar por</span>
        <select name="orden" value={orden} onChange={(evento) => router.push(direccion({ orden: evento.target.value }), { scroll: false })}>
          {ORDENES.map(({ valor, etiqueta }) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="boton boton--violeta">
          Buscar
        </button>
      </noscript>
    </form>
  );
}
