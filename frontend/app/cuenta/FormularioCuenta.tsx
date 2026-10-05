"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { crearApiCuenta, type ApiCuenta } from "../lib/cuenta/api-cuenta";
import { guardarSesion } from "../lib/cuenta/sesion";
import { obtenerPase } from "../lib/humano/pase";
import { ApiError } from "../lib/juego/tipos";
import "./acceso.css";

export type Modo = "entrar" | "crear";
type Metodo = "contrasena" | "enlace";

interface Props {
  api?: ApiCuenta;
  /** Con qué se abre: "crear" si se llegó desde un enlace a crear la cuenta. */
  modoInicial?: Modo;
  /** Se llama cuando se abrió la sesión con contraseña (la pantalla suele llevar a "jugar"). */
  alEntrar: () => void;
  /** Avisa cuando se pasa de entrar a crear la cuenta (y al revés): la pantalla cambia el collage. */
  alCambiarModo?: (modo: Modo) => void;
}

interface Fallo {
  mensaje: string;
  codigo?: string;
  status?: number;
}

const MINIMO_CONTRASENA = 10;
const MAXIMO_NOMBRE = 50;
const normalizar = (correo: string) => correo.trim().toLowerCase();

const ICONOS: Record<string, ReactNode> = {
  correo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  candado: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
};

function Icono({ nombre }: { nombre: keyof typeof ICONOS }) {
  return (
    <svg className="acceso__icono" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  );
}

const Flecha = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/**
 * Entrar o crear una cuenta, como en el diseño: dos pantallas ("Iniciá sesión" y "Creá tu cuenta") que se cambian con un enlace
 * de abajo. Se puede entrar de dos formas: con contraseña o con un enlace por correo (que también crea la cuenta la primera vez).
 * Quien se olvidó la contraseña pide otro enlace. Al crear la cuenta se puede elegir un nombre de usuario, que es el nombre
 * con el que se aparece en los rankings.
 */
export function FormularioCuenta({ api, alEntrar, alCambiarModo, modoInicial = "entrar" }: Props) {
  const cliente = api ?? crearApiCuenta();
  const idBase = useId();
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [metodo, setMetodo] = useState<Metodo>("contrasena");
  const [olvide, setOlvide] = useState(false);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [aceptaNovedades, setAceptaNovedades] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Si la comprobación humana está encendida, se resuelve al abrir el formulario y no al apretar el botón.
  useEffect(() => {
    void obtenerPase().catch(() => {});
  }, []);

  // La dirección acompaña al modo: /login?modo=crear se puede compartir.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (modo === "crear") url.searchParams.set("modo", "crear");
    else url.searchParams.delete("modo");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [modo]);

  const limpiar = () => {
    setFallo(null);
    setAviso(null);
  };

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    alCambiarModo?.(nuevo);
    setOlvide(false);
    limpiar();
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

  // Con el enlace por correo se puede crear la cuenta (la primera vez): ahí se muestran el aviso y la casilla de novedades.
  const enlaceQuePuedeCrear = !olvide && modo === "entrar" && metodo === "enlace";
  const pideContrasena = !olvide && (modo === "crear" || metodo === "contrasena");

  const pedirEnlace = (para: string) =>
    ejecutar(async () => {
      await cliente.pedirEnlace(para, enlaceQuePuedeCrear ? aceptaNovedades : false);
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
    if (modo === "entrar" && metodo === "enlace") return void pedirEnlace(para);

    if (!contrasena) return setFallo({ mensaje: "Escribí tu contraseña." });
    if (modo === "crear") {
      if (contrasena.length < MINIMO_CONTRASENA) {
        return setFallo({ mensaje: `La contraseña tiene que tener al menos ${MINIMO_CONTRASENA} caracteres.` });
      }
      // Al crear la cuenta se aceptan los Términos y la Política (el texto de abajo lo dice): el servidor lo registra.
      return void ejecutar(async () => {
        await cliente.registrar(para, contrasena, aceptaNovedades, nombre);
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

  const campoNombre = `${idBase}-nombre`;
  const campoCorreo = `${idBase}-correo`;
  const campoContrasena = `${idBase}-contrasena`;

  if (aviso) {
    return (
      <div className="acceso__formulario acceso__formulario--aviso">
        <h1 className="acceso__titulo">Revisá tu correo</h1>
        <div className="acceso__tarjeta">
          <p className="acceso__aviso" role="status">
            {aviso}
          </p>
          <button
            type="button"
            className="acceso__enlace"
            onClick={() => {
              limpiar();
              setContrasena("");
            }}
          >
            Usar otro correo
          </button>
        </div>
      </div>
    );
  }

  const titulo = olvide ? "Recuperá tu contraseña" : modo === "crear" ? "Creá tu cuenta" : "Iniciá sesión";
  const bajada = olvide
    ? "Te mandamos un enlace para que elijas una contraseña nueva."
    : modo === "crear"
      ? "Sumate a la comunidad, guardá tu progreso, competí y descubrí nueva música."
      : metodo === "enlace"
        ? "Te mandamos un enlace por correo para entrar sin contraseña."
        : "Para seguir jugando, guardar tu progreso y competir con otros.";
  const etiquetaEnvio = olvide
    ? "Enviarme el enlace"
    : modo === "crear"
      ? enviando
        ? "Creando…"
        : "Crear cuenta"
      : metodo === "enlace"
        ? "Enviarme el enlace"
        : enviando
          ? "Entrando…"
          : "Iniciar sesión";

  return (
    <div className="acceso__formulario">
      <h1 className="acceso__titulo">
        <span className="acceso__resaltado">{titulo.split(" ")[0]}</span> {titulo.split(" ").slice(1).join(" ")}
      </h1>
      <p className="acceso__bajada">{bajada}</p>

      <form className="acceso__tarjeta" onSubmit={alEnviar} noValidate>
        {modo === "crear" && !olvide && (
          <div className="acceso__campo">
            <label htmlFor={campoNombre}>Nombre de usuario</label>
            <div className="acceso__entrada">
              <Icono nombre="usuario" />
              <input id={campoNombre} type="text" autoComplete="nickname" placeholder="BrandonT" maxLength={MAXIMO_NOMBRE} value={nombre} onChange={(evento) => setNombre(evento.target.value)} />
            </div>
            <p className="acceso__ayuda">Así te verán otros jugadores.</p>
          </div>
        )}

        <div className="acceso__campo">
          <label htmlFor={campoCorreo}>Correo electrónico</label>
          <div className="acceso__entrada">
            <Icono nombre="correo" />
            <input id={campoCorreo} type="email" autoComplete="email" inputMode="email" placeholder="tuemail@ejemplo.com" value={correo} onChange={(evento) => setCorreo(evento.target.value)} />
          </div>
        </div>

        {pideContrasena && (
          <div className="acceso__campo">
            <label htmlFor={campoContrasena}>Contraseña</label>
            <div className="acceso__entrada">
              <Icono nombre="candado" />
              <input
                id={campoContrasena}
                type={verContrasena ? "text" : "password"}
                autoComplete={modo === "crear" ? "new-password" : "current-password"}
                placeholder={modo === "crear" ? `Mínimo ${MINIMO_CONTRASENA} caracteres` : "Tu contraseña"}
                value={contrasena}
                onChange={(evento) => setContrasena(evento.target.value)}
              />
              <button
                type="button"
                className="acceso__ojo"
                aria-label={verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={verContrasena}
                onClick={() => setVerContrasena((v) => !v)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {verContrasena && <path d="m4 4 16 16" />}
                </svg>
              </button>
            </div>
            {modo === "entrar" && metodo === "contrasena" && (
              <button
                type="button"
                className="acceso__olvide"
                onClick={() => {
                  setOlvide(true);
                  limpiar();
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>
        )}

        {enlaceQuePuedeCrear && (
          <p className="acceso__ayuda">
            Si todavía no tenés cuenta, al continuar se crea una y aceptás los{" "}
            <Link href="/terminos" target="_blank" rel="noopener noreferrer">
              Términos de uso
            </Link>{" "}
            y la{" "}
            <Link href="/privacidad" target="_blank" rel="noopener noreferrer">
              Política de privacidad
            </Link>
            .
          </p>
        )}

        {(enlaceQuePuedeCrear || (modo === "crear" && !olvide)) && (
          <label className="acceso__casilla">
            <input type="checkbox" checked={aceptaNovedades} onChange={(evento) => setAceptaNovedades(evento.target.checked)} />
            <span>
              Quiero recibir novedades de Banda Oriental por correo <em>(opcional)</em>
            </span>
          </label>
        )}

        {fallo && (
          <div className="acceso__error" role="alert">
            <p>{fallo.mensaje}</p>
            {fallo.codigo === "email_not_confirmed" && (
              <button type="button" className="acceso__enlace" onClick={() => void pedirEnlace(normalizar(correo))}>
                Enviarme un enlace para entrar
              </button>
            )}
            {fallo.status === 429 && (
              <button
                type="button"
                className="acceso__enlace"
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

        <button type="submit" className="acceso__enviar" disabled={enviando}>
          {etiquetaEnvio}
          <Flecha />
        </button>

        {modo === "entrar" && !olvide && (
          <>
            <p className="acceso__divisor">{metodo === "enlace" ? "o con tu contraseña" : "o entrá sin contraseña"}</p>
            <button type="button" className="acceso__alternativa" onClick={() => setMetodo(metodo === "enlace" ? "contrasena" : "enlace")}>
              {metodo === "enlace" ? "Entrar con contraseña" : "Entrar con un enlace por correo"}
            </button>
          </>
        )}

        {modo === "crear" && !olvide && (
          <p className="acceso__legal">
            Al crear una cuenta aceptás nuestros{" "}
            <Link href="/terminos" target="_blank" rel="noopener noreferrer">
              Términos de uso
            </Link>{" "}
            y{" "}
            <Link href="/privacidad" target="_blank" rel="noopener noreferrer">
              Política de privacidad
            </Link>
            .
          </p>
        )}

        <p className="acceso__cambio">
          {olvide ? (
            <button type="button" className="acceso__enlace" onClick={() => { setOlvide(false); limpiar(); }}>
              Volver
            </button>
          ) : modo === "entrar" ? (
            <>
              ¿No tenés cuenta?{" "}
              <button type="button" className="acceso__enlace" onClick={() => cambiarModo("crear")}>
                Creá una
              </button>
            </>
          ) : (
            <>
              ¿Ya tenés cuenta?{" "}
              <button type="button" className="acceso__enlace" onClick={() => cambiarModo("entrar")}>
                Iniciá sesión
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
