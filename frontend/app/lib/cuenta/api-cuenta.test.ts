import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idDeDispositivo } from "../juego/dispositivo";
import { crearApiCuenta } from "./api-cuenta";

const respuesta = (cuerpo: unknown, estado = 200) => ({
  ok: estado >= 200 && estado < 300,
  status: estado,
  json: () => (cuerpo === undefined ? Promise.reject(new Error("sin cuerpo")) : Promise.resolve(cuerpo)),
});

function simular(...respuestas: unknown[]) {
  const mock = vi.fn();
  respuestas.forEach((r) => mock.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const ultima = (mock: ReturnType<typeof vi.fn>) => {
  const [url, opciones] = mock.mock.calls.at(-1)!;
  return { url, opciones, cuerpo: opciones.body ? JSON.parse(opciones.body) : undefined };
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("crearApiCuenta: pedir un correo", () => {
  it.each([
    ["registrar", (api: ReturnType<typeof crearApiCuenta>) => api.registrar("ana@example.com", "una-clave-larga-1"), "/api/auth/register/", { email: "ana@example.com", password: "una-clave-larga-1" }],
    ["pedirEnlace", (api: ReturnType<typeof crearApiCuenta>) => api.pedirEnlace("ana@example.com"), "/api/auth/magic/request/", { email: "ana@example.com" }],
    ["pedirRestablecer", (api: ReturnType<typeof crearApiCuenta>) => api.pedirRestablecer("ana@example.com"), "/api/auth/password-reset/request/", { email: "ana@example.com" }],
  ])("%s manda el pedido y no devuelve nada (la API responde igual exista o no la cuenta)", async (_nombre, llamar, ruta, cuerpo) => {
    const mock = simular(respuesta({ detail: "Si el correo es válido, te enviamos un mensaje para continuar." }, 202));

    await expect(llamar(crearApiCuenta())).resolves.toBeUndefined();

    const { url, opciones, cuerpo: enviado } = ultima(mock);
    expect(url).toBe(`https://api.example${ruta}`);
    expect(opciones.method).toBe("POST");
    expect(enviado).toEqual(cuerpo);
  });
});

describe("crearApiCuenta: abrir una sesión", () => {
  it.each([
    ["entrar", (api: ReturnType<typeof crearApiCuenta>) => api.entrar("ana@example.com", "una-clave-larga-1"), "/api/auth/login/", { email: "ana@example.com", password: "una-clave-larga-1" }],
    ["confirmar", (api: ReturnType<typeof crearApiCuenta>) => api.confirmar("tok"), "/api/auth/confirm/", { token: "tok" }],
    ["verificarEnlace", (api: ReturnType<typeof crearApiCuenta>) => api.verificarEnlace("tok"), "/api/auth/magic/verify/", { token: "tok" }],
    ["confirmarRestablecer", (api: ReturnType<typeof crearApiCuenta>) => api.confirmarRestablecer("tok", "otra-clave-larga-2"), "/api/auth/password-reset/confirm/", { token: "tok", password: "otra-clave-larga-2" }],
  ])("%s devuelve el token y manda el identificador del dispositivo para asociar sus partidas", async (_nombre, llamar, ruta, cuerpo) => {
    const mock = simular(respuesta({ token: "sesion-123" }));

    const token = await llamar(crearApiCuenta());

    expect(token).toBe("sesion-123");
    const { url, opciones, cuerpo: enviado } = ultima(mock);
    expect(url).toBe(`https://api.example${ruta}`);
    expect(enviado).toEqual(cuerpo);
    expect(opciones.headers["X-Device-Id"]).toBe(idDeDispositivo());
  });

  it("un correo sin confirmar se informa con un código que la pantalla puede distinguir", async () => {
    simular(respuesta({ detail: "Confirmá tu correo antes de entrar.", code: "email_not_confirmed" }, 403));

    await expect(crearApiCuenta().entrar("ana@example.com", "x")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      codigo: "email_not_confirmed",
      message: "Confirmá tu correo antes de entrar.",
    });
  });

  it("el bloqueo por demasiados intentos llega con el mensaje de la API", async () => {
    simular(respuesta({ detail: "Demasiados intentos. Probá de nuevo en unos minutos." }, 429));

    await expect(crearApiCuenta().entrar("ana@example.com", "x")).rejects.toMatchObject({ status: 429 });
  });

  it("una contraseña débil llega con el motivo, campo por campo", async () => {
    simular(respuesta({ password: ["Esta contraseña es demasiado corta."] }, 400));

    await expect(crearApiCuenta().registrar("ana@example.com", "corta")).rejects.toMatchObject({
      status: 400,
      message: "Esta contraseña es demasiado corta.",
    });
  });

  it("si no hay conexión lanza un ApiError con status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(crearApiCuenta().entrar("a@b.co", "x")).rejects.toMatchObject({ status: 0 });
  });
});

describe("crearApiCuenta: con la sesión abierta", () => {
  it("yo() pide los datos de la cuenta con el token", async () => {
    const mock = simular(respuesta({ email: "ana@example.com", date_joined: "2026-10-04T00:00:00Z" }));

    const datos = await crearApiCuenta().yo("tok");

    expect(datos.email).toBe("ana@example.com");
    expect(ultima(mock).url).toBe("https://api.example/api/me/");
    expect(ultima(mock).opciones.headers.Authorization).toBe("Bearer tok");
  });

  it("salir() cierra la sesión en el servidor y no falla aunque el servidor no responda", async () => {
    const mock = simular(respuesta(undefined, 204));
    await expect(crearApiCuenta().salir("tok")).resolves.toBeUndefined();
    expect(ultima(mock).url).toBe("https://api.example/api/auth/logout/");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(crearApiCuenta().salir("tok")).resolves.toBeUndefined();
  });

  it("borrarCuenta() usa DELETE con el token", async () => {
    const mock = simular(respuesta(undefined, 204));

    await crearApiCuenta().borrarCuenta("tok");

    expect(ultima(mock).opciones.method).toBe("DELETE");
    expect(ultima(mock).opciones.headers.Authorization).toBe("Bearer tok");
  });

  it("borrarCuenta() informa si falla", async () => {
    simular(respuesta({ detail: "Falla interna." }, 500));

    await expect(crearApiCuenta().borrarCuenta("tok")).rejects.toMatchObject({ status: 500 });
  });

  it("historial() devuelve los días de la cuenta", async () => {
    const dias = [{ day: "2026-10-03", finished: true, won: true, winning_attempt: 2, score: 150, attempts: [], song: null }];
    simular(respuesta({ days: dias }));

    expect(await crearApiCuenta().historial("tok")).toEqual(dias);
  });

  it("un 401 con token se informa para que la pantalla cierre la sesión local", async () => {
    simular(respuesta({ detail: "Token inválido." }, 401));

    await expect(crearApiCuenta().historial("vencido")).rejects.toMatchObject({ status: 401 });
  });
});
