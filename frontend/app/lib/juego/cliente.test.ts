import { afterEach, describe, expect, it, vi } from "vitest";
import { crearCliente, esModoDemo } from "./cliente";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ID = "11111111-2222-4333-8444-555555555555";

describe("crearCliente", () => {
  it("usa la API real por defecto", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ results: [], has_more: false, page: 1 }) });
    vi.stubGlobal("fetch", fetchMock);

    await crearCliente().buscarCanciones("luna", 1);

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/songs/?q=luna&page=1");
  });

  it("con NEXT_PUBLIC_JUEGO_DEMO=1 usa todo de ejemplo, sin red", async () => {
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { canciones } = await crearCliente().buscarCanciones("a", 1);

    expect(canciones.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con NEXT_PUBLIC_JUEGO_DEMO=catalogo-real juega con la canción de ejemplo pero busca en la API", async () => {
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "catalogo-real");
    const real = [{ id: 7, title: "Tema real", artist: "Alguien", album: "Disco", year: 2000, genre: "" }];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ songs: real }) });
    vi.stubGlobal("fetch", fetchMock);
    const cliente = crearCliente();

    expect((await cliente.buscarCanciones("tema", 1)).canciones).toEqual(real);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/songs/");
    // El estado del día sigue siendo de ejemplo: no hay ningún pedido de /api/daily/.
    expect((await cliente.estadoDelDia(ID))?.finished).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("la demo nunca se activa en producción", async () => {
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "catalogo-real");
    vi.stubEnv("NODE_ENV", "production");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 404, json: () => Promise.resolve({ detail: "x" }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await crearCliente().estadoDelDia(ID)).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/daily/");
  });
});

describe("esModoDemo", () => {
  it("es falso por defecto", () => {
    expect(esModoDemo()).toBe(false);
  });

  it("es verdadero con cualquiera de los dos modos de demostración", () => {
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "1");
    expect(esModoDemo()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "catalogo-real");
    expect(esModoDemo()).toBe(true);
  });

  it("nunca es verdadero en producción", () => {
    vi.stubEnv("NEXT_PUBLIC_JUEGO_DEMO", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(esModoDemo()).toBe(false);
  });
});
