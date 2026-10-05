import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archivoFalso, AudioContextFalso, contextoActual, instalarAudioFalso } from "./audio-falso";
import { olvidarVelocidad } from "./calidad-de-audio";
import { Mezcla, vaciarCache } from "./mezcla";

const BATERIA = { clave: "dia:drums", url: "/drums.wav" };
const BAJO = { clave: "dia:bass", url: "/bass.wav" };

beforeEach(() => vaciarCache());
afterEach(() => vi.unstubAllGlobals());

function nueva(archivos: Record<string, ArrayBuffer>) {
  const pedir = instalarAudioFalso(archivos);
  const mezcla = new Mezcla(new AudioContextFalso() as unknown as AudioContext);
  return { pedir, mezcla, contexto: contextoActual() };
}

describe("Mezcla: la calidad se elige al bajar, según la conexión", () => {
  const CON_VERSIONES = { clave: "dia:drums", url: "/alta.m4a", variants: { high: "/alta.m4a", low: "/baja.m4a" } };
  const archivos = { "/alta.m4a": archivoFalso(1, 1), "/baja.m4a": archivoFalso(1, 1), "/drums.wav": archivoFalso(1, 1) };

  afterEach(() => olvidarVelocidad());

  it("con buena conexión baja la versión buena", async () => {
    const { mezcla, pedir } = nueva(archivos);

    await mezcla.cargar([CON_VERSIONES]);

    expect(pedir.mock.calls.map(([url]) => url)).toEqual(["/alta.m4a"]);
  });

  it("con una conexión lenta informada por el navegador baja la liviana", async () => {
    vi.stubGlobal("navigator", { connection: { effectiveType: "3g" } });
    const { mezcla, pedir } = nueva(archivos);

    await mezcla.cargar([CON_VERSIONES]);

    expect(pedir.mock.calls.map(([url]) => url)).toEqual(["/baja.m4a"]);
  });

  it("si la primera pista bajó lenta, la siguiente (otro intento) baja la liviana", async () => {
    const { mezcla, pedir } = nueva({ ...archivos, "/alta.m4a": new ArrayBuffer(400_000) });
    const reloj = vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(4000); // 400 KB en 4 s = 100 KB/s
    await mezcla.cargar([CON_VERSIONES]);
    reloj.mockRestore();

    await mezcla.cargar([CON_VERSIONES, { clave: "dia:bass", url: "/alta.m4a", variants: { high: "/alta.m4a", low: "/baja.m4a" } }]);

    expect(pedir.mock.calls.map(([url]) => url)).toEqual(["/alta.m4a", "/baja.m4a"]);
  });

  it("una pista sin versiones baja su dirección de siempre, con cualquier conexión", async () => {
    vi.stubGlobal("navigator", { connection: { saveData: true } });
    const { mezcla, pedir } = nueva(archivos);

    await mezcla.cargar([BATERIA]);

    expect(pedir.mock.calls.map(([url]) => url)).toEqual(["/drums.wav"]);
  });

  it("no mide archivos diminutos (no dicen nada de la conexión)", async () => {
    const { mezcla } = nueva(archivos);

    await mezcla.cargar([CON_VERSIONES]);
    const { mezcla: otra, pedir } = nueva(archivos);
    await otra.cargar([{ clave: "dia:otra", url: "/alta.m4a", variants: { high: "/alta.m4a", low: "/baja.m4a" } }]);

    expect(pedir.mock.calls.map(([url]) => url)).toEqual(["/alta.m4a"]); // la medición de un archivo chico no la empujó a la liviana
  });
});

describe("Mezcla: carga", () => {
  it("carga todas las pistas y mide la duración de la más larga", async () => {
    const { mezcla } = nueva({ "/drums.wav": archivoFalso(...Array(200).fill(0.1)), "/bass.wav": archivoFalso(...Array(300).fill(0.1)) });

    await mezcla.cargar([BATERIA, BAJO]);

    expect(mezcla.duracion).toBe(3);
  });

  it("no vuelve a bajar una pista que ya cargó, aunque cambie la dirección firmada", async () => {
    const { mezcla, pedir } = nueva({ "/drums.wav": archivoFalso(1, 1), "/drums-nueva.wav": archivoFalso(1, 1), "/bass.wav": archivoFalso(1, 1) });

    await mezcla.cargar([BATERIA]);
    await mezcla.cargar([{ clave: BATERIA.clave, url: "/drums-nueva.wav" }, BAJO]);

    expect(pedir.mock.calls.map(([url]) => url)).toEqual(["/drums.wav", "/bass.wav"]);
  });

  it("si una pista falla se rechaza la carga y la próxima vez vuelve a intentar", async () => {
    const { mezcla, pedir } = nueva({ "/drums.wav": archivoFalso(1, 1) });

    await expect(mezcla.cargar([BATERIA, BAJO])).rejects.toThrow();
    pedir.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => archivoFalso(1, 1) }));
    await expect(mezcla.cargar([BATERIA, BAJO])).resolves.toBeUndefined();
  });

  it("rechaza una respuesta con error HTTP (por ejemplo una dirección vencida)", async () => {
    const { mezcla, pedir } = nueva({});
    pedir.mockResolvedValue({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) } as never);

    await expect(mezcla.cargar([BATERIA])).rejects.toThrow();
  });
});

describe("Mezcla: onda", () => {
  it("dibuja la suma de las pistas, no solo la última", async () => {
    // La batería suena solo al principio y el bajo solo al final: la onda de la mezcla tiene los dos.
    const bateria = archivoFalso(1, 1, 0, 0);
    const bajo = archivoFalso(0, 0, 1, 1);
    const { mezcla } = nueva({ "/drums.wav": bateria, "/bass.wav": bajo });

    await mezcla.cargar([BATERIA, BAJO]);

    expect(mezcla.picos(2)).toEqual([1, 1]);
  });

  it("devuelve las barras pedidas", async () => {
    const { mezcla } = nueva({ "/drums.wav": archivoFalso(...Array(500).fill(0.3)) });
    await mezcla.cargar([BATERIA]);

    expect(mezcla.picos(64)).toHaveLength(64);
  });
});

describe("Mezcla: reproducción", () => {
  it("arranca todas las pistas juntas, en el mismo instante", async () => {
    const { mezcla, contexto } = nueva({ "/drums.wav": archivoFalso(1, 1, 1), "/bass.wav": archivoFalso(1, 1, 1) });
    await mezcla.cargar([BATERIA, BAJO]);

    contexto.currentTime = 5;
    mezcla.iniciar(0);

    expect(contexto.fuentes).toHaveLength(2);
    const arranques = contexto.fuentes.map((fuente) => fuente.start.mock.calls[0]);
    expect(arranques[0]).toEqual(arranques[1]);
    expect(mezcla.sonando).toBe(true);
  });

  it("mide la posición con el reloj del audio y se detiene al pausar", async () => {
    const { mezcla, contexto } = nueva({ "/drums.wav": archivoFalso(...Array(1000).fill(0.2)) });
    await mezcla.cargar([BATERIA]);

    contexto.currentTime = 10;
    mezcla.iniciar(0);
    contexto.currentTime = 12.5;
    expect(mezcla.posicion()).toBeCloseTo(2.5, 5);

    expect(mezcla.pausar()).toBeCloseTo(2.5, 5);
    contexto.currentTime = 20;
    expect(mezcla.posicion()).toBeCloseTo(2.5, 5);
    expect(mezcla.sonando).toBe(false);
    contexto.fuentes.forEach((fuente) => expect(fuente.stop).toHaveBeenCalled());
  });

  it("al reanudar sigue desde donde quedó", async () => {
    const { mezcla, contexto } = nueva({ "/drums.wav": archivoFalso(...Array(1000).fill(0.2)) });
    await mezcla.cargar([BATERIA]);
    mezcla.iniciar(0);
    contexto.currentTime = 3;
    const donde = mezcla.pausar();

    contexto.currentTime = 7;
    mezcla.iniciar(donde);

    expect(contexto.fuentes.at(-1)!.start.mock.calls[0][1]).toBeCloseTo(3, 5);
  });

  it("la posición no pasa de la duración", async () => {
    const { mezcla, contexto } = nueva({ "/drums.wav": archivoFalso(...Array(200).fill(0.2)) });
    await mezcla.cargar([BATERIA]);
    mezcla.iniciar(0);

    contexto.currentTime = 99;

    expect(mezcla.posicion()).toBe(2);
  });

  it("detener libera las pistas", async () => {
    const { mezcla, contexto } = nueva({ "/drums.wav": archivoFalso(1, 1) });
    await mezcla.cargar([BATERIA]);
    mezcla.iniciar(0);

    mezcla.detener();

    expect(mezcla.sonando).toBe(false);
    contexto.fuentes.forEach((fuente) => expect(fuente.disconnect).toHaveBeenCalled());
  });
});
