"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { crearApiCuenta, type ApiCuenta } from "../lib/cuenta/api-cuenta";
import { borrarSesion } from "../lib/cuenta/sesion";
import { useSesion } from "../lib/cuenta/useSesion";
import { borrarHistorial } from "../lib/juego/almacen-historial";
import { ApiError } from "../lib/juego/tipos";
import "./cuenta.css";

const PALABRA = "BORRAR";

/** "Mi cuenta": a quién pertenece la sesión, cerrarla y borrar la cuenta. */
export function PanelCuenta({ api }: { api?: ApiCuenta }) {
  const cliente = api ?? crearApiCuenta();
  const { sesion, lista } = useSesion();
  const campo = useId();
  const [confirmando, setConfirmando] = useState(false);
  const [palabra, setPalabra] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrada, setBorrada] = useState(false);

  if (borrada) {
    return (
      <div className="cuenta__tarjeta">
        <p className="cuenta__aviso" role="status">
          Tu cuenta se borró, con tus partidas y tus puntajes. Podés seguir jugando sin cuenta cuando quieras.
        </p>
        <div className="cuenta__acciones">
          <Link href="/jugar" className="boton boton--grande boton--violeta">
            Jugar el diario
          </Link>
        </div>
      </div>
    );
  }

  if (!lista) return <div className="cuenta__tarjeta" aria-busy="true" />;

  if (!sesion) {
    return (
      <div className="cuenta__tarjeta">
        <p className="cuenta__texto">Todavía no iniciaste sesión.</p>
        <div className="cuenta__acciones">
          <Link href="/login" className="boton boton--grande boton--violeta">
            Iniciar sesión o crear cuenta
          </Link>
        </div>
      </div>
    );
  }

  async function cerrarSesion() {
    if (!sesion) return;
    setTrabajando(true);
    await cliente.salir(sesion.token);
    // El historial de este dispositivo se queda: son las partidas que se jugaron acá.
    borrarSesion();
    setTrabajando(false);
  }

  async function borrarCuenta() {
    if (!sesion || palabra.trim().toUpperCase() !== PALABRA) return;
    setTrabajando(true);
    setError(null);
    try {
      await cliente.borrarCuenta(sesion.token);
      borrarSesion();
      borrarHistorial();
      setBorrada(true);
    } catch (fallo) {
      setError(fallo instanceof ApiError ? fallo.message : "No se pudo borrar la cuenta. Probá de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="cuenta__tarjeta">
      <dl className="cuenta__datos">
        <dt>Tu cuenta</dt>
        <dd>{sesion.email || "Sesión iniciada"}</dd>
      </dl>

      <div className="cuenta__acciones">
        <Link href="/jugar" className="boton boton--grande boton--violeta">
          Jugar el diario
        </Link>
        <Link href="/historial" className="boton boton--grande boton--claro">
          Ver mi historial
        </Link>
        <button type="button" className="boton boton--grande boton--claro" onClick={cerrarSesion} disabled={trabajando}>
          Cerrar sesión
        </button>
      </div>

      <section className="cuenta__peligro" aria-labelledby={`${campo}-titulo`}>
        <h2 id={`${campo}-titulo`}>Borrar mi cuenta</h2>
        {!confirmando ? (
          <>
            <p className="cuenta__ayuda">Se borran tu cuenta, tus partidas y tus puntajes (también salen del ranking).</p>
            <button type="button" className="cuenta__boton-peligro" onClick={() => setConfirmando(true)}>
              Borrar mi cuenta
            </button>
          </>
        ) : (
          <>
            <p className="cuenta__ayuda">
              Esto no se puede deshacer: se borran tu cuenta, tus partidas y tus puntajes, y también el historial guardado
              en este dispositivo.
            </p>
            <label className="cuenta__campo" htmlFor={campo}>
              Escribí {PALABRA} para confirmar
            </label>
            <input
              id={campo}
              className="cuenta__entrada"
              autoComplete="off"
              value={palabra}
              onChange={(evento) => setPalabra(evento.target.value)}
            />
            {error && (
              <p className="cuenta__error" role="alert">
                {error}
              </p>
            )}
            <div className="cuenta__acciones">
              <button
                type="button"
                className="cuenta__boton-peligro cuenta__boton-peligro--confirmar"
                disabled={trabajando || palabra.trim().toUpperCase() !== PALABRA}
                onClick={borrarCuenta}
              >
                Sí, borrar todo
              </button>
              <button
                type="button"
                className="cuenta__boton-peligro"
                onClick={() => {
                  setConfirmando(false);
                  setPalabra("");
                  setError(null);
                }}
              >
                Mejor no
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
