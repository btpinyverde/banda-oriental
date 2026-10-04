"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { crearApiCuenta, type ApiCuenta } from "../lib/cuenta/api-cuenta";
import { guardarSesion } from "../lib/cuenta/sesion";
import { obtenerPase } from "../lib/humano/pase";
import { ApiError } from "../lib/juego/tipos";
import "./cuenta.css";

type Pestania = "entrar" | "crear";
type Metodo = "contrasena" | "enlace";

interface Props {
  api?: ApiCuenta;
  /** Se llama cuando se abrió la sesión con contraseña (la pantalla suele llevar a "Mi cuenta"). */
  alEntrar: () => void;
}

interface Fallo {
  mensaje: string;
  codigo?: string;
  status?: number;
}

const MINIMO_CONTRASENA = 10;
const normalizar = (correo: string) => correo.trim().toLowerCase();

/**
 * Entrar o crear una cuenta. Se puede entrar de dos formas y la persona elige: con contraseña o con un enlace que
 * le llega por correo (que también crea la cuenta la primera vez). Quien se olvidó la contraseña pide otro enlace.
 */
export function FormularioCuenta({ api, alEntrar }: Props) {
  const cliente = api ?? crearApiCuenta();
  const idBase = useId();
  const [pestania, setPestania] = useState<Pestania>("entrar");
  const [metodo, setMetodo] = useState<Metodo>("contrasena");
  const [olvide, setOlvide] = useState(false);
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Si la comprobación humana está encendida, se resuelve al abrir el formulario y no al apretar el botón.
  useEffect(() => {
    void obtenerPase().catch(() => {});
  }, []);

  const limpiar = () => {
    setFallo(null);
    setAviso(null);
  };

  async function ejecutar(accion: () => Promise<void>) {
    setEnviando(true);
    setFallo(null);
    try {
      await accion();
    } catch (error) {
      const api = error instanceof ApiError ? error : null;
      setFallo({
        mensaje: api?.message ?? "No se pudo completar. Probá de nuevo.",
        codigo: api?.codigo,
        status: api?.status,
      });
    } finally {
      setEnviando(false);
    }
  }

  const pedirEnlace = (para: string) =>
    ejecutar(async () => {
      await cliente.pedirEnlace(para);
      setAviso(
        `Si el correo es válido, te enviamos un enlace a ${para}. Sirve una sola vez y vence en 15 minutos. Si no lo ves, revisá la carpeta de spam.`,
      );
    });

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    const para = normalizar(correo);
    if (!para) return setFallo({ mensaje: "Escribí tu correo." });

    if (olvide) {
      return void ejecutar(async () => {
        await cliente.pedirRestablecer(para);
        setAviso(
          "Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Vence en 15 minutos. Si no lo ves, revisá la carpeta de spam.",
        );
      });
    }
    if (pestania === "entrar" && metodo === "enlace") return void pedirEnlace(para);

    if (!contrasena) return setFallo({ mensaje: "Escribí tu contraseña." });
    if (pestania === "crear") {
      if (contrasena.length < MINIMO_CONTRASENA) {
        return setFallo({ mensaje: `La contraseña tiene que tener al menos ${MINIMO_CONTRASENA} caracteres.` });
      }
      return void ejecutar(async () => {
        await cliente.registrar(para, contrasena);
        setAviso(
          `Te enviamos un mensaje a ${para}. Confirmá tu correo con el enlace para terminar de crear la cuenta; vence en 24 horas. Si no lo ves, revisá la carpeta de spam.`,
        );
      });
    }
    void ejecutar(async () => {
      const token = await cliente.entrar(para, contrasena);
      guardarSesion({ token, email: para });
      alEntrar();
    });
  }

  const campoCorreo = `${idBase}-correo`;
  const campoContrasena = `${idBase}-contrasena`;

  if (aviso) {
    return (
      <div className="cuenta__tarjeta">
        <p className="cuenta__aviso" role="status">
          {aviso}
        </p>
        <button
          type="button"
          className="cuenta__enlace"
          onClick={() => {
            limpiar();
            setContrasena("");
          }}
        >
          Usar otro correo
        </button>
      </div>
    );
  }

  const etiquetaEnvio = olvide
    ? "Enviarme el enlace"
    : pestania === "crear"
      ? enviando
        ? "Creando…"
        : "Crear cuenta"
      : metodo === "enlace"
        ? "Enviarme el enlace"
        : enviando
          ? "Entrando…"
          : "Entrar";

  return (
    <div className="cuenta__tarjeta">
      {olvide ? (
        <>
          <h2 className="cuenta__titulo">Recuperar contraseña</h2>
          <p className="cuenta__texto">Te mandamos un enlace para que elijas una contraseña nueva.</p>
        </>
      ) : (
        <div className="cuenta__pestanias" role="tablist" aria-label="Cuenta">
          {(["entrar", "crear"] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={pestania === valor}
              className={`cuenta__pestania${pestania === valor ? " cuenta__pestania--activa" : ""}`}
              onClick={() => {
                setPestania(valor);
                setFallo(null);
              }}
            >
              {valor === "entrar" ? "Entrar" : "Crear cuenta"}
            </button>
          ))}
        </div>
      )}

      <form className="cuenta__formulario" onSubmit={alEnviar} noValidate>
        {!olvide && pestania === "entrar" && (
          <fieldset className="cuenta__metodos">
            <legend className="solo-lectores">Cómo querés entrar</legend>
            <label className="cuenta__metodo">
              <input type="radio" name={`${idBase}-metodo`} checked={metodo === "contrasena"} onChange={() => setMetodo("contrasena")} />
              <span>Con contraseña</span>
            </label>
            <label className="cuenta__metodo">
              <input type="radio" name={`${idBase}-metodo`} checked={metodo === "enlace"} onChange={() => setMetodo("enlace")} />
              <span>Con un enlace por correo</span>
            </label>
          </fieldset>
        )}

        <label className="cuenta__campo" htmlFor={campoCorreo}>
          Correo
        </label>
        <input
          id={campoCorreo}
          className="cuenta__entrada"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={correo}
          onChange={(evento) => setCorreo(evento.target.value)}
        />

        {!olvide && (pestania === "crear" || metodo === "contrasena") && (
          <>
            <label className="cuenta__campo" htmlFor={campoContrasena}>
              Contraseña
            </label>
            <input
              id={campoContrasena}
              className="cuenta__entrada"
              type="password"
              autoComplete={pestania === "crear" ? "new-password" : "current-password"}
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
            />
            {pestania === "crear" && <p className="cuenta__ayuda">Al menos {MINIMO_CONTRASENA} caracteres.</p>}
          </>
        )}

        {fallo && (
          <div className="cuenta__error" role="alert">
            <p>{fallo.mensaje}</p>
            {fallo.codigo === "email_not_confirmed" && (
              <button type="button" className="cuenta__enlace" onClick={() => void pedirEnlace(normalizar(correo))}>
                Enviarme un enlace para entrar
              </button>
            )}
            {fallo.status === 429 && (
              <button
                type="button"
                className="cuenta__enlace"
                onClick={() => {
                  setMetodo("enlace");
                  setFallo(null);
                }}
              >
                Mejor entrar con un enlace por correo
              </button>
            )}
          </div>
        )}

        <button type="submit" className="boton boton--grande boton--violeta cuenta__enviar" disabled={enviando}>
          {etiquetaEnvio}
        </button>

        {pestania === "crear" && !olvide && (
          <p className="cuenta__ayuda">
            También podés entrar sin contraseña: con el enlace por correo se crea la cuenta la primera vez. Elegí esa
            opción en la pestaña Entrar.
          </p>
        )}
      </form>

      {olvide ? (
        <button
          type="button"
          className="cuenta__enlace"
          onClick={() => {
            setOlvide(false);
            limpiar();
          }}
        >
          Volver
        </button>
      ) : (
        pestania === "entrar" &&
        metodo === "contrasena" && (
          <button
            type="button"
            className="cuenta__enlace"
            onClick={() => {
              setOlvide(true);
              limpiar();
            }}
          >
            Olvidé mi contraseña
          </button>
        )
      )}
    </div>
  );
}
