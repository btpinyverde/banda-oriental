"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type UIEvent } from "react";
import { normalizarTexto as normalizar } from "../lib/juego/logica";
import type { CancionCatalogo } from "../lib/juego/tipos";

// Se dibuja de a tandas: al llegar al final del scroll aparecen más. Así el catálogo entero no se pinta de golpe.
const TANDA = 30;
const MARGEN_SCROLL = 48;

interface Props {
  canciones: CancionCatalogo[];
  /** Falso mientras no se pueda responder (el audio todavía no sonó, hay un envío en curso, etc.). */
  puedeEnviar: boolean;
  enviando?: boolean;
  alEnviar: (cancion: CancionCatalogo) => void;
}

/** Buscador de canciones con lista de opciones (combobox accesible) y botón para enviar el intento. */
export function BuscadorCanciones({ canciones, puedeEnviar, enviando = false, alEnviar }: Props) {
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [elegida, setElegida] = useState<CancionCatalogo | null>(null);

  const [cargadas, setCargadas] = useState(TANDA);

  // El catálogo ordenado una sola vez: por artista, luego por disco (año y nombre) y luego por título. El texto
  // en el que se busca (título, artista y disco, normalizados) también se calcula una sola vez.
  const indice = useMemo(
    () =>
      canciones
        .map((cancion) => ({
          cancion,
          orden: [normalizar(cancion.artist), String(cancion.year ?? 9999).padStart(4, "0"), normalizar(cancion.album), normalizar(cancion.title)],
          texto: normalizar(`${cancion.title} ${cancion.artist} ${cancion.album}`),
        }))
        .sort((a, b) => {
          for (let i = 0; i < a.orden.length; i++) {
            if (a.orden[i] !== b.orden[i]) return a.orden[i] < b.orden[i] ? -1 : 1;
          }
          return a.cancion.id - b.cancion.id;
        }),
    [canciones],
  );

  const consulta = normalizar(texto.trim());
  // Sin texto no se busca ni se muestra nada: recién al escribir aparecen canciones.
  const coincidencias = elegida || consulta === "" ? [] : indice.filter((entrada) => entrada.texto.includes(consulta));
  const opciones = coincidencias.slice(0, cargadas).map((entrada) => entrada.cancion);
  const hayMas = opciones.length < coincidencias.length;
  const listaVisible = abierta && opciones.length > 0;
  const sinResultados = abierta && consulta !== "" && !elegida && coincidencias.length === 0;
  const idOpcion = (i: number) => `${idBase}-opcion-${i}`;
  const puedeMandar = !!elegida && puedeEnviar && !enviando;

  // Con el teclado, la opción activa tiene que quedar a la vista dentro de la lista con scroll.
  useEffect(() => {
    if (activa >= 0) document.getElementById(idOpcion(activa))?.scrollIntoView?.({ block: "nearest" });
  }, [activa]);

  function cargarMas() {
    setCargadas((actual) => actual + TANDA);
  }

  function alScrollear(evento: UIEvent<HTMLUListElement>) {
    const lista = evento.currentTarget;
    if (hayMas && lista.scrollTop + lista.clientHeight >= lista.scrollHeight - MARGEN_SCROLL) cargarMas();
  }

  function elegir(cancion: CancionCatalogo) {
    setElegida(cancion);
    setTexto(cancion.title);
    setAbierta(false);
    setActiva(-1);
  }

  function enviar() {
    if (!elegida || !puedeMandar) return;
    alEnviar(elegida);
    setElegida(null);
    setTexto("");
    setActiva(-1);
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown" && opciones.length > 0) {
      evento.preventDefault();
      setAbierta(true);
      setActiva((actual) => {
        if (actual + 1 < opciones.length) return actual + 1;
        if (hayMas) {
          cargarMas(); // al pasar la última opción cargada se piden más y se sigue bajando
          return actual + 1;
        }
        return 0;
      });
    } else if (evento.key === "ArrowUp" && opciones.length > 0) {
      evento.preventDefault();
      setAbierta(true);
      setActiva((actual) => (actual <= 0 ? opciones.length - 1 : actual - 1));
    } else if (evento.key === "Enter") {
      if (listaVisible && activa >= 0) {
        evento.preventDefault();
        elegir(opciones[activa]);
      }
    } else if (evento.key === "Escape") {
      setAbierta(false);
    }
  }

  return (
    <form
      className="buscador"
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
    >
      <label htmlFor={`${idBase}-campo`} className="solo-lectores">
        Buscá una canción
      </label>
      <div className="buscador__campo">
        <svg className="buscador__lupa" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m20 20-4.5-4.5" />
        </svg>
        <input
          id={`${idBase}-campo`}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="Escribí una canción..."
          value={texto}
          aria-expanded={listaVisible}
          aria-controls={listaVisible ? idLista : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listaVisible && activa >= 0 ? idOpcion(activa) : undefined}
          onFocus={() => setAbierta(true)}
          onBlur={() => setAbierta(false)}
          onClick={() => setAbierta(true)}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setElegida(null);
            setAbierta(true);
            setActiva(-1);
            setCargadas(TANDA);
          }}
          onKeyDown={alTeclear}
        />
        <button type="submit" className="buscador__enviar" aria-label="Enviar intento" disabled={!puedeMandar}>
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 24h33M28 11l13 13-13 13" />
          </svg>
        </button>
      </div>

      {listaVisible && (
        <ul id={idLista} className="buscador__opciones" role="listbox" aria-label="Canciones" onScroll={alScrollear}>
          {opciones.map((cancion, i) => (
            <li
              key={cancion.id}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activa}
              className={`buscador__opcion${i === activa ? " buscador__opcion--activa" : ""}`}
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => elegir(cancion)}
            >
              <span className="buscador__titulo">{cancion.title}</span>
              <span className="buscador__artista">{[cancion.artist, cancion.album, cancion.year].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}

      {sinResultados && (
        <p className="buscador__vacio" role="status">
          No encontramos esa canción.
        </p>
      )}
    </form>
  );
}
