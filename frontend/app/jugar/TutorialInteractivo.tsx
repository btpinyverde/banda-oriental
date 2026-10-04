"use client";

import { useEffect, useId, useRef, useState } from "react";
import { OPCIONES, RESPUESTA, evaluar, pistasDesbloqueadas } from "../lib/tutorial/practica";
import { sonarPistas } from "../lib/tutorial/sonido";
import type { TipoStem } from "../lib/juego/tipos";
import { FilaStems } from "./FilaStems";
import { TablaIntentos, type IntentoMostrado } from "./TablaIntentos";

type Paso = "bienvenida" | "pistas" | "adivinar" | "final";

interface Props {
  /** Se llama al terminar o al saltar el tutorial. */
  alCerrar: () => void;
  /** Hace sonar las pistas de práctica; se puede reemplazar (en las pruebas, o para usar audios reales). */
  sonar?: (tipos: TipoStem[]) => void;
}

const COLORES = "Verde: coincide. Amarillo: cerca (el año correcto es anterior o posterior; la flecha te dice hacia dónde). Rosa: no coincide.";

/**
 * Manual interactivo de la primera vez: se juega una ronda de práctica con una canción de mentira (el audio se
 * sintetiza en el momento, no hay nada que bajar) para entender cómo se desbloquean las pistas y qué significan los colores.
 * Es un diálogo modal que siempre se puede saltar.
 */
export function TutorialInteractivo({ alCerrar, sonar = sonarPistas }: Props) {
  const [paso, setPaso] = useState<Paso>("bienvenida");
  const [escuchada, setEscuchada] = useState(false);
  const [intentos, setIntentos] = useState<IntentoMostrado[]>([]);
  const [mensaje, setMensaje] = useState("");
  const titulo = useId();
  const principal = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") alCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);

  useEffect(() => principal.current?.focus(), [paso]);

  const numero = intentos.length + 1; // el intento en curso
  const desbloqueadas = pistasDesbloqueadas(paso === "adivinar" ? numero : 1);
  const escuchar = () => {
    sonar(desbloqueadas.map((pista) => pista.stem_type));
    setEscuchada(true);
  };

  function elegir(opcion: (typeof OPCIONES)[number]) {
    const correcto = opcion.id === RESPUESTA.id;
    const feedback = evaluar(opcion);
    setIntentos((anteriores) => [...anteriores, { numero: anteriores.length + 1, feedback, cancion: opcion, correcto }]);
    if (correcto) {
      setPaso("final");
      return;
    }
    const casiTodo = feedback.year === "exact" && feedback.genre === "same" && feedback.artist === "same" && feedback.album === "same";
    setMensaje(
      `${casiTodo ? "Coincide en todo, pero no es la canción: solo la exacta gana. " : ""}${COLORES} Cada error abre una pista más: ahora tenés ${pistasDesbloqueadas(intentos.length + 2).length}.`,
    );
  }

  return (
    <div className="tutorial" role="presentation">
      <div className="tutorial__ventana" role="dialog" aria-modal="true" aria-labelledby={titulo}>
        <h2 id={titulo} className="tutorial__titulo">
          {paso === "final" ? "¡Listo!" : "Cómo se juega"}
        </h2>

        {paso === "bienvenida" && (
          <>
            <p>
              Cada día suena una canción uruguaya, <strong>por partes</strong>: primero un instrumento, y cada error abre
              otro. Tenés seis intentos para descubrirla.
            </p>
            <p>Vamos a probar con una canción de práctica, para que veas cómo es. Dura un minuto.</p>
            <div className="tutorial__acciones">
              <button ref={principal} type="button" className="boton boton--violeta" onClick={() => setPaso("pistas")}>
                Empezar
              </button>
              <button type="button" className="boton boton--claro" onClick={alCerrar}>
                Saltar
              </button>
            </div>
          </>
        )}

        {paso === "pistas" && (
          <>
            <p>
              Esta es la <strong>pista 1</strong>: la batería. Cada pista es un instrumento suelto de la canción.
              Escuchala y, cuando estés listo, seguimos.
            </p>
            <FilaStems desbloqueadas={desbloqueadas} />
            <div className="tutorial__acciones">
              <button type="button" className="boton boton--claro" onClick={escuchar}>
                ▶ Escuchar
              </button>
              <button type="button" className="boton boton--violeta" disabled={!escuchada} onClick={() => setPaso("adivinar")}>
                Seguir
              </button>
              <button type="button" className="boton boton--claro" onClick={alCerrar}>
                Saltar
              </button>
            </div>
          </>
        )}

        {paso === "adivinar" && (
          <>
            <p>Elegí la canción que creés que es. Si fallás, la tabla te da pistas y se abre otra pista de audio.</p>
            <FilaStems desbloqueadas={desbloqueadas} />
            <TablaIntentos intentos={intentos} />
            {mensaje && (
              <p className="tutorial__mensaje" role="status">
                {mensaje}
              </p>
            )}
            <ul className="tutorial__opciones" aria-label="Canciones para elegir">
              {OPCIONES.map((opcion) => (
                <li key={opcion.id}>
                  <button
                    type="button"
                    className="tutorial__opcion"
                    disabled={intentos.some((intento) => intento.cancion?.id === opcion.id)}
                    onClick={() => elegir(opcion)}
                  >
                    <strong>{opcion.title}</strong>
                    <span>
                      {opcion.artist} · {opcion.album} ({opcion.year})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="tutorial__acciones">
              <button type="button" className="boton boton--claro" onClick={escuchar}>
                ▶ Escuchar
              </button>
              <button type="button" className="boton boton--claro" onClick={alCerrar}>
                Saltar
              </button>
            </div>
          </>
        )}

        {paso === "final" && (
          <>
            <p>
              ¡Esa era! La encontraste en {intentos.length} {intentos.length === 1 ? "intento" : "intentos"}.
            </p>
            <p>
              En el juego de verdad, <strong>menos intentos = más puntos</strong>, y podés guardar tu puntaje en el ranking.
              Hay una canción nueva todos los días, la misma para todo el mundo.
            </p>
            <div className="tutorial__acciones">
              <button ref={principal} type="button" className="boton boton--violeta" onClick={alCerrar}>
                Jugar la de hoy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
