"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { crearApiCuenta, type ApiCuenta } from "../../lib/cuenta/api-cuenta";
import { guardarSesion } from "../../lib/cuenta/sesion";
import { ApiError } from "../../lib/juego/tipos";
import "../cuenta.css";

type Tipo = "confirmar" | "acceso" | "restablecer";
type Fase =
  | { fase: "leyendo" }
  | { fase: "pedir-contrasena" }
  | { fase: "listo"; tipo: Tipo }
  | { fase: "error"; mensaje: string };

const TIPOS: Tipo[] = ["confirmar", "acceso", "restablecer"];
const ENLACE_INVALIDO = "El enlace no es válido o venció.";
const MINIMO_CONTRASENA = 10;

const mensajeDe = (error: unknown) => (error instanceof ApiError ? error.message : "No se pudo completar. Probá de nuevo.");

const MENSAJES: Record<Tipo, string> = {
  confirmar: "¡Listo! Tu correo quedó confirmado y ya entraste a tu cuenta.",
  acceso: "¡Listo! Ya entraste a tu cuenta.",
  restablecer: "¡Listo! Tu contraseña quedó cambiada y ya entraste a tu cuenta.",
};

/**
 * Lo que pasa al abrir el enlace de un correo (`/cuenta/entrar#token=...&tipo=...`): confirmar el correo, entrar sin
 * contraseña o elegir una contraseña nueva. El token viaja en el fragmento de la dirección para que no llegue a
 * ningún servidor, y se saca de la barra apenas se lee para que no quede en el historial del navegador.
 */
export function EntrarConEnlace({ api }: { api?: ApiCuenta }) {
  const cliente = api ?? crearApiCuenta();
  const [estado, setEstado] = useState<Fase>({ fase: "leyendo" });
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorDeContrasena, setErrorDeContrasena] = useState<string | null>(null);
  const token = useRef("");
  const iniciado = useRef(false);
  const campo = useId();

  async function abrirSesion(tipo: Tipo, pedirToken: () => Promise<string>) {
    const sesion = await pedirToken();
    // El correo solo sirve para mostrarlo: si no se puede leer, la sesión se abre igual.
    const email = await cliente.yo(sesion).then((datos) => datos.email, () => "");
    guardarSesion({ token: sesion, email });
    setEstado({ fase: "listo", tipo });
  }

  useEffect(() => {
    // Un enlace sirve una sola vez: aunque React monte dos veces la pantalla en desarrollo, se usa una sola.
    if (iniciado.current) return;
    iniciado.current = true;

    const partes = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const leido = partes.get("token") ?? "";
    const tipo = partes.get("tipo") as Tipo | null;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (!leido || !tipo || !TIPOS.includes(tipo)) return setEstado({ fase: "error", mensaje: ENLACE_INVALIDO });
    token.current = leido;
    if (tipo === "restablecer") return setEstado({ fase: "pedir-contrasena" });

    const pedir = tipo === "confirmar" ? () => cliente.confirmar(leido) : () => cliente.verificarEnlace(leido);
    abrirSesion(tipo, pedir).catch((error) => setEstado({ fase: "error", mensaje: mensajeDe(error) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardarContrasena(evento: FormEvent) {
    evento.preventDefault();
    if (contrasena.length < MINIMO_CONTRASENA) {
      return setErrorDeContrasena(`La contraseña tiene que tener al menos ${MINIMO_CONTRASENA} caracteres.`);
    }
    setEnviando(true);
    setErrorDeContrasena(null);
    try {
      await abrirSesion("restablecer", () => cliente.confirmarRestablecer(token.current, contrasena));
    } catch (error) {
      // Si la contraseña no sirvió el enlace no se gastó: se puede corregir y volver a probar.
      const venceElEnlace = error instanceof ApiError && error.status === 400 && /enlace/i.test(error.message);
      if (venceElEnlace) setEstado({ fase: "error", mensaje: error.message });
      else setErrorDeContrasena(mensajeDe(error));
    } finally {
      setEnviando(false);
    }
  }

  if (estado.fase === "leyendo") {
    return (
      <div className="cuenta__tarjeta">
        <p className="cuenta__texto" role="status">
          Un momento…
        </p>
      </div>
    );
  }

  if (estado.fase === "error") {
    return (
      <div className="cuenta__tarjeta">
        <p className="cuenta__error" role="alert">
          {estado.mensaje}
        </p>
        <div className="cuenta__acciones">
          <Link href="/login" className="boton boton--grande boton--violeta">
            Pedir un enlace nuevo
          </Link>
        </div>
      </div>
    );
  }

  if (estado.fase === "pedir-contrasena") {
    return (
      <form className="cuenta__tarjeta" onSubmit={guardarContrasena} noValidate>
        <h2 className="cuenta__titulo">Elegí tu contraseña nueva</h2>
        <label className="cuenta__campo" htmlFor={campo}>
          Contraseña nueva
        </label>
        <input
          id={campo}
          className="cuenta__entrada"
          type="password"
          autoComplete="new-password"
          value={contrasena}
          onChange={(evento) => setContrasena(evento.target.value)}
        />
        <p className="cuenta__ayuda">Al menos {MINIMO_CONTRASENA} caracteres. Se cierran las demás sesiones de tu cuenta.</p>
        {errorDeContrasena && (
          <p className="cuenta__error" role="alert">
            {errorDeContrasena}
          </p>
        )}
        <button type="submit" className="boton boton--grande boton--violeta cuenta__enviar" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    );
  }

  return (
    <div className="cuenta__tarjeta">
      <p className="cuenta__aviso" role="status">
        {MENSAJES[estado.tipo]}
      </p>
      <div className="cuenta__acciones">
        <Link href="/jugar" className="boton boton--grande boton--violeta">
          Jugar el diario
        </Link>
        <Link href="/cuenta" className="boton boton--grande boton--claro">
          Ir a mi cuenta
        </Link>
      </div>
    </div>
  );
}
