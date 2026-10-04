"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { guardarIntento, leerIntentos, leerSegundos, sumarSegundos } from "../lib/juego/almacen";
import { codificarCuadricula, type DatosStory } from "../lib/compartir/story";
import { guardarPartida } from "../lib/juego/almacen-historial";
import { crearCliente } from "../lib/juego/cliente";
import { idDeDispositivo } from "../lib/juego/dispositivo";
import { etiquetaDelDia, formatoCuentaAtras, segundosHastaMedianoche, stemActual } from "../lib/juego/logica";
import { useDiaActual } from "../lib/juego/useDiaActual";
import type { CancionCatalogo, ClienteJuego, EstadoDelDia, EstadoEnCurso } from "../lib/juego/tipos";
import { AyudaColores } from "./AyudaColores";
import { BuscadorCanciones } from "./BuscadorCanciones";
import { FilaStems } from "./FilaStems";
import { PantallaFinal } from "./PantallaFinal";
import { ReproductorPista } from "./ReproductorPista";
import { TablaIntentos, type IntentoMostrado } from "./TablaIntentos";

type Vista =
  | { tipo: "cargando" }
  | { tipo: "error" }
  | { tipo: "sinCancion" }
  | { tipo: "listo"; estado: EstadoDelDia };

const mensajeDe = (e: unknown, porDefecto: string) => (e instanceof Error && e.message ? e.message : porDefecto);

/** Une el cliente de la API con la pantalla de juego y la final. Sin `cliente` usa el real (o la demo). */
export function JuegoDiario({ cliente }: { cliente?: ClienteJuego }) {
  const api = useMemo(() => cliente ?? crearCliente(), [cliente]);
  const [vista, setVista] = useState<Vista>({ tipo: "cargando" });
  const [canciones, setCanciones] = useState<CancionCatalogo[]>([]);
  const [intentos, setIntentos] = useState<IntentoMostrado[]>([]);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [segundosParaProxima, setSegundosParaProxima] = useState(() => segundosHastaMedianoche(new Date()));
  const inicioIntento = useRef(0);
  const [tardando, setTardando] = useState(false);

  /** Intentos de un estado en curso: lo que dice el backend más lo guardado en este navegador. */
  const intentosDe = useCallback((estado: EstadoEnCurso): IntentoMostrado[] => {
    const guardados = leerIntentos(estado.day);
    return estado.feedback_history.map((h) => ({
      numero: h.attempt_number,
      feedback: h.feedback,
      cancion: guardados[h.attempt_number],
      textoAdivinado: h.guessed_text,
      correcto: false,
    }));
  }, []);

  const cargar = useCallback(async () => {
    setVista({ tipo: "cargando" });
    try {
      const estado = await api.estadoDelDia(idDeDispositivo());
      if (!estado) {
        setVista({ tipo: "sinCancion" });
        return;
      }
      if (!estado.finished) {
        setCanciones(await api.listarCanciones());
        setIntentos(intentosDe(estado));
      }
      setVista({ tipo: "listo", estado });
    } catch {
      setVista({ tipo: "error" });
    }
  }, [api, intentosDe]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const reloj = window.setInterval(() => setSegundosParaProxima(segundosHastaMedianoche(new Date())), 1000);
    return () => window.clearInterval(reloj);
  }, []);

  const estado = vista.tipo === "listo" ? vista.estado : null;

  // Si la carga tarda, probablemente el servidor estaba dormido: se avisa para que no parezca que se colgó.
  const cargando = vista.tipo === "cargando";
  useEffect(() => {
    if (!cargando) {
      setTardando(false);
      return;
    }
    const temporizador = window.setTimeout(() => setTardando(true), 6000);
    return () => window.clearTimeout(temporizador);
  }, [cargando]);

  // Si la página queda abierta pasada la medianoche, el día de la pantalla quedó viejo: se carga la canción nueva.
  const hoy = useDiaActual();
  const diaCargado = estado?.day;
  useEffect(() => {
    if (diaCargado && diaCargado < hoy) void cargar();
  }, [hoy, diaCargado, cargar]);

  const numeroActual = estado && !estado.finished ? estado.attempt_number : 0;

  // Al terminar el día (ganando o perdiendo, o al volver a abrir un día ya terminado) la partida queda guardada
  // en este dispositivo. Se repite sin problema: el historial tiene una sola partida por día y la va completando.
  const terminada = estado && estado.finished ? estado : null;
  useEffect(() => {
    if (!terminada) return;
    const guardadas = Object.keys(leerIntentos(terminada.day)).length;
    const usados = terminada.won
      ? (terminada.winning_attempt ?? (intentos.length || guardadas || null))
      : 6;
    guardarPartida({
      dia: terminada.day,
      ...(terminada.number !== undefined && { numero: terminada.number }),
      ganada: terminada.won,
      intentos: usados,
      cancion: terminada.song,
      ...(intentos.length > 0 && { feedback: intentos.map((intento) => intento.feedback) }),
      ...(terminada.score !== undefined && { puntaje: terminada.score }),
    });
  }, [terminada?.day, terminada?.won, terminada?.score, terminada?.winning_attempt, intentos.length]);
  useEffect(() => {
    inicioIntento.current = Date.now();
  }, [numeroActual]);

  async function volverASincronizar(): Promise<EstadoDelDia | null> {
    try {
      return await api.estadoDelDia(idDeDispositivo());
    } catch {
      return null;
    }
  }

  /** Las direcciones del audio están firmadas y vencen: si el audio falla, se piden de nuevo con el estado del día. */
  async function renovarAudio() {
    if (!estado || estado.finished) return;
    const actual = await volverASincronizar();
    if (actual && !actual.finished && actual.attempt_number === estado.attempt_number) {
      setVista({ tipo: "listo", estado: actual });
    }
  }

  async function enviar(cancion: CancionCatalogo) {
    if (!estado || estado.finished) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const resultado = await api.enviarIntento(idDeDispositivo(), estado.attempt_number, cancion.id);
      guardarIntento(estado.day, resultado.attempt_number, cancion);
      sumarSegundos(estado.day, (Date.now() - inicioIntento.current) / 1000);
      setIntentos((actuales) => [
        ...actuales,
        { numero: resultado.attempt_number, feedback: resultado.feedback, cancion, correcto: resultado.is_correct },
      ]);
      const nuevo = await api.estadoDelDia(idDeDispositivo());
      if (nuevo) setVista({ tipo: "listo", estado: nuevo });
    } catch (e) {
      setErrorEnvio(mensajeDe(e, "No se pudo enviar el intento."));
      // Si el pedido llegó pero la respuesta no, el backend ya avanzó: se reconcilia con su estado.
      const actual = await volverASincronizar();
      if (actual) {
        setVista({ tipo: "listo", estado: actual });
        if (!actual.finished) setIntentos(intentosDe(actual));
      }
    } finally {
      setEnviando(false);
    }
  }

  async function guardarPuntaje(nombre: string) {
    if (!estado) return;
    await api.enviarPuntaje(idDeDispositivo(), nombre, leerSegundos(estado.day));
    const nuevo = await volverASincronizar();
    if (nuevo) setVista({ tipo: "listo", estado: nuevo });
  }

  if (vista.tipo === "cargando") {
    return (
      <div className="jugar__mensaje">
        <p role="status">Cargando la canción de hoy…</p>
        {tardando && (
          <p className="jugar__espera">El servidor estaba dormido y está despertando. Puede tardar hasta un minuto.</p>
        )}
      </div>
    );
  }

  if (vista.tipo === "error") {
    return (
      <div className="jugar__mensaje">
        <h1 className="jugar__titulo">No pudimos cargar el juego</h1>
        <p>Revisá tu conexión e intentá de nuevo.</p>
        <button type="button" className="boton boton--violeta" onClick={() => void cargar()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (vista.tipo === "sinCancion") {
    return (
      <div className="jugar__mensaje">
        <h1 className="jugar__titulo">Todavía no hay canción para hoy</h1>
        <p>Volvé en un rato: la canción del día se publica a medianoche.</p>
      </div>
    );
  }

  const actual = vista.estado;
  const cuenta = formatoCuentaAtras(segundosParaProxima);

  if (actual.finished) {
    // La imagen para compartir necesita los colores de cada intento: si se volvió a abrir un día ya terminado
    // y no se guardaron, no hay con qué dibujarla.
    const compartir: DatosStory | undefined =
      intentos.length > 0
        ? {
            filas: codificarCuadricula(intentos.map((intento) => intento.feedback)).split("."),
            intentos: actual.won ? (actual.winning_attempt ?? intentos.length) : null,
            dia: actual.day,
            ...(actual.number !== undefined && { numero: actual.number }),
          }
        : undefined;

    return (
      <div className="jugar__tarjeta">
        {intentos.length > 0 && <TablaIntentos intentos={intentos} />}
        <PantallaFinal
          estado={actual}
          intentosUsados={intentos.length}
          segundosParaProxima={segundosParaProxima}
          alGuardarPuntaje={guardarPuntaje}
          compartir={compartir}
        />
      </div>
    );
  }

  const pista = stemActual(actual.unlocked_stems);

  return (
    <div className="jugar__tarjeta">
      <div className="jugar__cabecera">
        <span className="chip chip--gris">{etiquetaDelDia(actual)}</span>
        <span className="chip chip--gris">Modo clásico</span>
        <span className="jugar__cuenta chip chip--amarillo">
          <img src="/assets/sun.svg" alt="" width={22} height={22} />
          <span>Nueva canción en</span>
          <strong>{cuenta}</strong>
        </span>
      </div>

      <div className="jugar__titulo-fila">
        <h1 className="jugar__titulo">¿Qué canción es?</h1>
        <AyudaColores />
      </div>

      {/* Una clave por día e intento: hay 4 pistas y 6 intentos, así que la URL se repite y sin esto el
          reproductor seguiría "escuchado" en un intento nuevo. */}
      {pista && <ReproductorPista key={`${actual.day}-${actual.attempt_number}`} src={pista.url} alCambiarListo={setListo} alFallar={renovarAudio} />}
      <FilaStems desbloqueadas={actual.unlocked_stems} />

      <TablaIntentos intentos={intentos} />
      <p className="jugar__intento">Intento {actual.attempt_number} de 6</p>

      <BuscadorCanciones canciones={canciones} puedeEnviar={listo} enviando={enviando} alEnviar={enviar} />
      {errorEnvio && (
        <p className="jugar__error" role="alert">
          {errorEnvio}
        </p>
      )}
    </div>
  );
}
