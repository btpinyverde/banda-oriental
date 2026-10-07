"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import type { BuscarCanciones, CancionCatalogo } from "../lib/juego/tipos";

const MARGEN_SCROLL = 48;
// Con menos letras el servidor no busca (devolvería casi todo el catálogo): no se pide nada.
const MINIMO_DE_LETRAS = 2;
const ESPERA_AL_TECLEAR_MS = 250;

interface Props {
  /** Busca en el servidor, de a páginas. El buscador nunca tiene el catálogo entero. */
  buscar: BuscarCanciones;
  /** Falso mientras no se pueda responder (el audio todavía no sonó, hay un envío en curso, etc.). */
  puedeEnviar: boolean;
  enviando?: boolean;
  alEnviar: (cancion: CancionCatalogo) => void;
  /** Cómo se llama el botón de enviar para quien usa un lector de pantalla (por ejemplo "Agregar a la lista"). */
  etiquetaDeEnviar?: string;
  /** Cuánto se espera después de la última tecla para buscar (solo cambia en las pruebas). */
  esperaMs?: number;
}

type Estado = "ocioso" | "buscando" | "error";

/**
 * Buscador de canciones con lista de opciones (combobox accesible) y botón para enviar el intento. Busca en el servidor mientras se
 * escribe (esperando a que se deje de teclear) y trae la lista de a páginas: la siguiente se pide al llegar al final del scroll.
 */
export function BuscadorCanciones({ buscar, puedeEnviar, enviando = false, alEnviar, etiquetaDeEnviar = "Enviar intento", esperaMs = ESPERA_AL_TECLEAR_MS }: Props) {
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [elegida, setElegida] = useState<CancionCatalogo | null>(null);

  const [opciones, setOpciones] = useState<CancionCatalogo[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [estado, setEstado] = useState<Estado>("ocioso");
  // Con qué texto se hizo la búsqueda cuyos resultados se muestran: así "no encontramos nada" solo sale cuando de verdad terminó de buscar.
  const [buscadoCon, setBuscadoCon] = useState("");
  const pagina = useRef(1);
  const control = useRef<AbortController | null>(null);
  // La función de buscar se guarda en una referencia: si quien usa el buscador pasa una función nueva en cada dibujo, no se vuelve a buscar.
  const buscarActual = useRef(buscar);
  buscarActual.current = buscar;

  const consulta = elegida ? "" : texto.trim().replace(/\s+/g, " ");
  const buscable = consulta.length >= MINIMO_DE_LETRAS;

  // Trae una página. Si llega una respuesta vieja (se escribió otra cosa mientras tanto) se descarta.
  const traer = useCallback(
    async (texto: string, numero: number) => {
      control.current?.abort();
      const actual = new AbortController();
      control.current = actual;
      setEstado("buscando");
      try {
        const resultado = await buscarActual.current(texto, numero, actual.signal);
        if (actual.signal.aborted) return;
        pagina.current = numero;
        setOpciones((previas) => {
          if (numero === 1) return resultado.canciones;
          const ya = new Set(previas.map((c) => c.id));
          return [...previas, ...resultado.canciones.filter((c) => !ya.has(c.id))];
        });
        setHayMas(resultado.hayMas);
        setBuscadoCon(texto);
        setEstado("ocioso");
      } catch {
        if (actual.signal.aborted) return;
        setEstado("error");
      }
    },
    [],
  );

  // Cada vez que cambia lo que se busca: espera a que se deje de teclear y pide la primera página. Sin texto suficiente, no hay nada.
  useEffect(() => {
    if (!buscable) {
      control.current?.abort();
      setOpciones([]);
      setHayMas(false);
      setBuscadoCon("");
      setEstado("ocioso");
      return;
    }
    const temporizador = setTimeout(() => void traer(consulta, 1), esperaMs);
    return () => clearTimeout(temporizador);
  }, [consulta, buscable, traer, esperaMs]);

  // Al cerrar la pantalla no queda ningún pedido en vuelo.
  useEffect(() => () => control.current?.abort(), []);

  const mostrando = buscable && opciones.length > 0;
  const listaVisible = abierta && mostrando;
  const sinResultados = abierta && buscable && estado === "ocioso" && buscadoCon === consulta && opciones.length === 0;
  const buscandoDeCero = abierta && buscable && estado === "buscando" && opciones.length === 0;
  const idOpcion = (i: number) => `${idBase}-opcion-${i}`;
  const puedeMandar = !!elegida && puedeEnviar && !enviando;

  // Con el teclado, la opción activa tiene que quedar a la vista dentro de la lista con scroll.
  useEffect(() => {
    if (activa >= 0) document.getElementById(idOpcion(activa))?.scrollIntoView?.({ block: "nearest" });
  }, [activa]);

  function cargarMas() {
    if (hayMas && estado !== "buscando" && buscable) void traer(consulta, pagina.current + 1);
  }

  function alScrollear(evento: UIEvent<HTMLUListElement>) {
    const lista = evento.currentTarget;
    if (lista.scrollTop + lista.clientHeight >= lista.scrollHeight - MARGEN_SCROLL) cargarMas();
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
      if (activa + 1 < opciones.length) setActiva(activa + 1);
      else if (hayMas) cargarMas(); // en la última cargada: se pide la página siguiente y, cuando llega, se puede seguir bajando
      else setActiva(0);
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
          }}
          onKeyDown={alTeclear}
        />
        <button type="submit" className="buscador__enviar" aria-label={etiquetaDeEnviar} disabled={!puedeMandar}>
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
          {estado === "buscando" && (
            <li className="buscador__cargando" aria-hidden="true">
              Cargando más…
            </li>
          )}
        </ul>
      )}

      {buscandoDeCero && (
        <p className="buscador__vacio" role="status">
          Buscando…
        </p>
      )}

      {sinResultados && (
        <p className="buscador__vacio" role="status">
          No encontramos esa canción.
        </p>
      )}

      {estado === "error" && (
        <p className="buscador__vacio" role="alert">
          No pudimos buscar. Revisá tu conexión y escribí de nuevo.
        </p>
      )}
    </form>
  );
}
