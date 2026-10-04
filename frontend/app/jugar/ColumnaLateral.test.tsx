import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardarSesion, borrarSesion } from "../lib/cuenta/sesion";
import { guardarPartida } from "../lib/juego/almacen-historial";
import * as servidor from "../lib/juego/estadisticas-servidor";
import type { EstadisticasServidor } from "../lib/juego/tipos";
import type { Partida } from "../lib/juego/historial";
import { ColumnaLateral } from "./ColumnaLateral";

const HOY = "2026-10-10";
const partida = (dia: string, ganada = true, intentos: number | null = 3, extra: Partial<Partida> = {}): Partida => ({
  dia,
  ganada,
  intentos,
  ...extra,
  cancion: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
});

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${HOY}T15:00:00Z`));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const estadistica = (etiqueta: string) => within(screen.getByRole("region", { name: /Mis estadísticas/ })).getByText(etiqueta).closest("li") as HTMLElement;

describe("ColumnaLateral: sin partidas", () => {
  it("muestra todo en cero e invita a jugar, sin inventar números", () => {
    render(<ColumnaLateral />);

    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("0 días")).toBeInTheDocument();
    expect(screen.getByText("Jugá hoy para empezar tu racha.")).toBeInTheDocument();
    expect(estadistica("jugadas")).toHaveTextContent("0");
    expect(estadistica("aciertos")).toHaveTextContent("—");
    expect(estadistica("intentos promedio")).toHaveTextContent("—");
  });
});

describe("ColumnaLateral: con lo jugado en el dispositivo", () => {
  beforeEach(() => {
    guardarPartida(partida("2026-10-08", true, 2));
    guardarPartida(partida("2026-10-09", true, 3));
    guardarPartida(partida("2026-10-10", true, 4));
  });

  it("muestra la racha actual", () => {
    render(<ColumnaLateral />);

    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("3 días")).toBeInTheDocument();
    expect(screen.queryByText("Jugá hoy para empezar tu racha.")).toBeNull();
  });

  it("calcula jugadas, porcentaje de aciertos, racha máxima y promedio de intentos", () => {
    render(<ColumnaLateral />);

    expect(estadistica("jugadas")).toHaveTextContent("3");
    expect(estadistica("aciertos")).toHaveTextContent("100%");
    expect(estadistica("racha máx.")).toHaveTextContent("3");
    expect(estadistica("intentos promedio")).toHaveTextContent("3");
  });

  it("escribe el promedio con coma decimal, como se usa en Uruguay", () => {
    guardarPartida(partida("2026-10-05", true, 1));

    render(<ColumnaLateral />);

    expect(estadistica("intentos promedio")).toHaveTextContent("2,5");
  });

  it("se actualiza cuando termina otra partida", () => {
    window.localStorage.clear();
    render(<ColumnaLateral />);
    expect(estadistica("jugadas")).toHaveTextContent("0");

    act(() => guardarPartida(partida(HOY, true, 2)));

    expect(estadistica("jugadas")).toHaveTextContent("1");
    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("1 día")).toBeInTheDocument();
  });

  it("los cinco puntos de la racha cuentan cómo fueron los últimos cinco días", () => {
    guardarPartida(partida("2026-10-07", false, 6));
    const { container } = render(<ColumnaLateral />);

    const puntos = [...container.querySelectorAll(".lateral__puntos span")].map((p) => p.className);
    expect(puntos).toEqual([
      "lateral__punto--sin-jugar",
      "lateral__punto--perdida",
      "lateral__punto--ganada",
      "lateral__punto--ganada",
      "lateral__punto--ganada",
    ]);
  });

  it("describe los últimos cinco días con texto, no solo con color", () => {
    render(<ColumnaLateral />);

    expect(screen.getByText(/Últimos 5 días: .*ganaste/)).toBeInTheDocument();
  });
});

describe("ColumnaLateral: enlaces y colores", () => {
  it("lleva al historial completo", () => {
    render(<ColumnaLateral />);

    expect(screen.getByRole("link", { name: /Ver historial/ })).toHaveAttribute("href", "/historial");
  });

  it("no usa amarillo ni rosa en los datos: destaca solo el promedio de intentos", () => {
    const { container } = render(<ColumnaLateral />);

    expect(container.querySelector(".lateral__dato--amarillo, .lateral__dato--rosa")).toBeNull();
    expect(container.querySelectorAll(".lateral__dato--destacado")).toHaveLength(1);
  });

  it("no muestra el ranking de ejemplo salvo que se pida", () => {
    const { rerender } = render(<ColumnaLateral />);
    expect(screen.queryByRole("region", { name: "Ranking del día" })).toBeNull();

    rerender(<ColumnaLateral conRankingEjemplo />);
    expect(screen.getByRole("region", { name: "Ranking del día" })).toBeInTheDocument();
    expect(screen.getByText("Datos de ejemplo")).toBeInTheDocument();
  });
});

describe("ColumnaLateral: compartir el resultado de hoy", () => {
  const feedback = [{ year: "newer" as const, genre: "same" as const, artist: "same" as const, album: "different" as const }];

  it("ofrece compartir cuando hoy ya se jugó y se guardaron los colores de los intentos", () => {
    guardarPartida(partida(HOY, true, 1, { feedback }));

    render(<ColumnaLateral />);

    expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
  });

  it("no lo ofrece si hoy todavía no se jugó", () => {
    guardarPartida(partida("2026-10-09", true, 1, { feedback }));

    render(<ColumnaLateral />);

    expect(screen.queryByRole("button", { name: "Compartir resultado" })).toBeNull();
  });

  it("no lo ofrece si hoy se jugó pero no hay colores guardados", () => {
    guardarPartida(partida(HOY, true, 1));

    render(<ColumnaLateral />);

    expect(screen.queryByRole("button", { name: "Compartir resultado" })).toBeNull();
  });
});


const delServidor = (cambios: Partial<EstadisticasServidor> = {}): EstadisticasServidor => ({
  public_name: "Ana",
  played: 12,
  won: 9,
  win_percentage: 75,
  current_streak: 7,
  max_streak: 8,
  total_score: 9000,
  average_attempts: 2.4,
  distribution: [1, 4, 3, 1, 0, 0],
  last_played_day: HOY,
  ...cambios,
});

describe("ColumnaLateral: con las estadísticas que calculó el servidor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("muestra las cifras del servidor, no las que salen de lo guardado en el dispositivo", async () => {
    guardarPartida(partida("2026-10-10", true, 4)); // en el dispositivo hay una sola partida
    vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(delServidor());

    render(<ColumnaLateral />);

    await waitFor(() => expect(estadistica("jugadas")).toHaveTextContent("12"));
    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("7 días")).toBeInTheDocument();
    expect(estadistica("aciertos")).toHaveTextContent("75%");
    expect(estadistica("racha máx.")).toHaveTextContent("8");
    expect(estadistica("intentos promedio")).toHaveTextContent("2,4");
  });

  it("si el servidor no responde, sigue mostrando lo guardado en el dispositivo", async () => {
    guardarPartida(partida("2026-10-09", true, 3));
    guardarPartida(partida("2026-10-10", true, 3));
    const pedir = vi.spyOn(servidor, "pedirEstadisticas").mockRejectedValue(new Error("sin red"));

    render(<ColumnaLateral />);

    await waitFor(() => expect(pedir).toHaveBeenCalled());
    expect(estadistica("jugadas")).toHaveTextContent("2");
    expect(within(screen.getByRole("region", { name: "Racha actual" })).getByText("2 días")).toBeInTheDocument();
  });

  it("con cero partidas en el servidor sigue invitando a jugar, y los promedios vacíos se muestran con una raya", async () => {
    vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(
      delServidor({ played: 0, won: 0, win_percentage: null, current_streak: 0, max_streak: 0, average_attempts: null }),
    );

    render(<ColumnaLateral />);

    await waitFor(() => expect(estadistica("jugadas")).toHaveTextContent("0"));
    expect(screen.getByText("Jugá hoy para empezar tu racha.")).toBeInTheDocument();
    expect(estadistica("aciertos")).toHaveTextContent("—");
    expect(estadistica("intentos promedio")).toHaveTextContent("—");
  });
});

describe("ColumnaLateral: aviso para quien juega sin cuenta", () => {
  const AVISO = /Creá tu cuenta para no perder tu racha/;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "1");
    vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(delServidor());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    borrarSesion();
  });

  it("lo muestra a quien ya jugó y no tiene cuenta, con el motivo y el camino para crearla", async () => {
    render(<ColumnaLateral />);

    const aviso = await screen.findByText(AVISO);
    expect(aviso.closest("section, div, p")).toHaveTextContent(/una semana/);
    expect(screen.getByRole("link", { name: /Crear mi cuenta/ })).toHaveAttribute("href", "/login");
  });

  it("no lo muestra a quien todavía no jugó nada", async () => {
    vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(delServidor({ played: 0, current_streak: 0 }));

    render(<ColumnaLateral />);

    await waitFor(() => expect(estadistica("jugadas")).toHaveTextContent("0"));
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("no lo muestra a quien ya tiene sesión iniciada", async () => {
    guardarSesion({ token: "t", email: "ana@example.com" });

    render(<ColumnaLateral />);

    await waitFor(() => expect(estadistica("jugadas")).toHaveTextContent("12"));
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("no lo muestra mientras las cuentas estén apagadas", async () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "");

    render(<ColumnaLateral />);

    await waitFor(() => expect(estadistica("jugadas")).toHaveTextContent("12"));
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});


describe("ColumnaLateral: cambiar el nombre del ranking", () => {
  afterEach(() => vi.restoreAllMocks());

  it("quien ya tiene un nombre puede cambiarlo desde acá, y se refrescan sus cifras", async () => {
    const pedir = vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(delServidor({ public_name: "Ana" }));
    const cambiar = vi.spyOn(servidor, "cambiarNombre").mockResolvedValue(delServidor({ public_name: "Anita" }));

    render(<ColumnaLateral />);
    fireEvent.click(await screen.findByText("Cambiar mi nombre"));
    fireEvent.change(screen.getByLabelText("Tu nombre en el ranking"), { target: { value: "Anita" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar" })));

    expect(cambiar).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/), "Anita");
    // y las cifras se vuelven a pedir, ya con el nombre nuevo
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(2));
  });

  it("quien todavía no eligió nombre no ve la opción: se elige al guardar el primer puntaje", async () => {
    vi.spyOn(servidor, "pedirEstadisticas").mockResolvedValue(delServidor({ public_name: null }));

    render(<ColumnaLateral />);

    await waitFor(() => expect(estadistica("jugadas")).toHaveTextContent("12"));
    expect(screen.queryByText("Cambiar mi nombre")).toBeNull();
  });
});
