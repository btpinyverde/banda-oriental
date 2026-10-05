import { idDeDispositivo } from "../juego/dispositivo";
import { pedirConPase } from "../humano/pedir-con-pase";
import { comoJson, pedir, sinCuerpo } from "../juego/http";

export interface DatosDeCuenta {
  email: string;
  date_joined: string;
  /** Si eligió recibir novedades de Banda Oriental por correo (apagado salvo que lo tilde). */
  accepts_news: boolean;
  /** Cuándo aceptó los Términos y la Política de Privacidad, al crear la cuenta; `null` en cuentas anteriores. */
  terms_accepted_at: string | null;
  /** Si la cuenta puede crear batallas mientras el modo se prueba (el servidor lo decide). */
  can_create_battles?: boolean;
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
    // Crear la cuenta exige aceptar los Términos y la Política de Privacidad (la casilla del formulario es obligatoria,
    // por eso se manda siempre `true`). Las novedades por correo son aparte, opcionales y apagadas por defecto.
    // El nombre de usuario es el nombre público de los rankings; es opcional (vacío = no se manda).
    registrar: async (email: string, password: string, aceptaNovedades = false, nombre = ""): Promise<void> =>
      sinCuerpo(
        await enviar(
          "/api/auth/register/",
          { email, password, accepts_terms: true, accepts_news: aceptaNovedades, ...(nombre.trim() && { public_name: nombre.trim() }) },
          {},
          true,
        ),
      ),
    // El enlace puede crear la cuenta, así que lleva la elección de novedades (los Términos se aceptan al continuar).
    pedirEnlace: async (email: string, aceptaNovedades = false): Promise<void> =>
      sinCuerpo(await enviar("/api/auth/magic/request/", { email, accepts_news: aceptaNovedades }, {}, true)),
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

    /** Cambia de idea sobre las novedades por correo. Devuelve los datos de la cuenta ya actualizados. */
    cambiarNovedades: async (token: string, aceptaNovedades: boolean): Promise<DatosDeCuenta> =>
      comoJson(
        await pedir("/api/me/", {
          method: "PATCH",
          headers: { ...JSON_HEADERS, ...conToken(token) },
          body: JSON.stringify({ accepts_news: aceptaNovedades }),
        }),
      ),

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
