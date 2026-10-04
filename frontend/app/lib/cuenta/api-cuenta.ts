import { idDeDispositivo } from "../juego/dispositivo";
import { pedirConPase } from "../humano/pedir-con-pase";
import { comoJson, pedir, sinCuerpo } from "../juego/http";

export interface DatosDeCuenta {
  email: string;
  date_joined: string;
}

/** Cada día jugado por la cuenta, como lo devuelve `GET /api/me/history/`. */
export interface DiaDeCuenta {
  day: string;
  finished: boolean;
  won: boolean;
  winning_attempt: number | null;
  score: number | null;
  attempts: {
    attempt_number: number;
    guessed_text: string;
    is_correct: boolean;
    feedback: { year: string; genre: string; artist: string; album: string };
  }[];
  /** Solo si el día terminó. */
  song: { title: string; artist: string; album: string; year: number | null } | null;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const enviar = (ruta: string, cuerpo: unknown, extra: Record<string, string> = {}, conComprobacion = false) =>
  (conComprobacion ? pedirConPase : pedir)(ruta, { method: "POST", headers: { ...JSON_HEADERS, ...extra }, body: JSON.stringify(cuerpo) });

const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Todo lo que el sitio le pide a la API de cuentas. Los pedidos que abren una sesión mandan el identificador del
 * dispositivo para que el backend asocie a la cuenta las partidas jugadas antes sin cuenta. Contrato:
 * docs/contrato-api-cuentas.md.
 */
export function crearApiCuenta() {
  // Entrar con contraseña pide la comprobación humana; los enlaces del correo no (ya llevan un secreto de un solo uso).
  const abrirSesion = async (ruta: string, cuerpo: unknown, conComprobacion = false): Promise<string> => {
    const datos = await comoJson<{ token: string }>(
      await enviar(ruta, cuerpo, { "X-Device-Id": idDeDispositivo() }, conComprobacion),
    );
    return datos.token;
  };

  return {
    // Estos tres responden siempre lo mismo (exista o no la cuenta): no devuelven nada.
    registrar: async (email: string, password: string): Promise<void> =>
      sinCuerpo(await enviar("/api/auth/register/", { email, password }, {}, true)),
    pedirEnlace: async (email: string): Promise<void> =>
      sinCuerpo(await enviar("/api/auth/magic/request/", { email }, {}, true)),
    pedirRestablecer: async (email: string): Promise<void> =>
      sinCuerpo(await enviar("/api/auth/password-reset/request/", { email }, {}, true)),

    // Estos abren una sesión y devuelven su token.
    entrar: (email: string, password: string) => abrirSesion("/api/auth/login/", { email, password }, true),
    confirmar: (token: string) => abrirSesion("/api/auth/confirm/", { token }),
    verificarEnlace: (token: string) => abrirSesion("/api/auth/magic/verify/", { token }),
    confirmarRestablecer: (token: string, password: string) =>
      abrirSesion("/api/auth/password-reset/confirm/", { token, password }),

    yo: async (token: string): Promise<DatosDeCuenta> =>
      comoJson(await pedir("/api/me/", { headers: conToken(token), cache: "no-store" })),

    historial: async (token: string): Promise<DiaDeCuenta[]> => {
      const datos = await comoJson<{ days: DiaDeCuenta[] }>(
        await pedir("/api/me/history/", { headers: conToken(token), cache: "no-store" }),
      );
      return datos.days;
    },

    /** Cierra la sesión en el servidor; si no se puede, igual se cierra acá (no hay por qué trabar a la persona). */
    salir: async (token: string): Promise<void> => {
      try {
        await pedir("/api/auth/logout/", { method: "POST", headers: conToken(token) });
      } catch {
        // Sin conexión: la sesión local se borra de todos modos.
      }
    },

    borrarCuenta: async (token: string): Promise<void> =>
      sinCuerpo(await pedir("/api/me/", { method: "DELETE", headers: conToken(token) })),
  };
}

export type ApiCuenta = ReturnType<typeof crearApiCuenta>;
