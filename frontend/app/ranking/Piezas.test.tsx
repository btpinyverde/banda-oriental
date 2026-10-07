import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Destacados, FilaRanking, RankingServidor } from "../lib/juego/tipos";
import { AvatarDeJugador, ComoSeCalculaElPuntaje, EstadisticasGlobalesDelJuego, HeroDelRanking, LlamadoACuenta, ListaDestacada, OtrosRecords, TablaDelRanking, TuPosicion } from "./Piezas";

afterEach(cleanup);

const fila = (rank: number, display_name: string, score: number, extra: Partial<FilaRanking> = {}): FilaRanking => ({ rank, display_name, score, games: 3, current_streak: 4, win_percentage: 90, played: 20, ...extra });

describe("AvatarDeJugador", () => {
  it("es la inicial del nombre sobre un color, decorativa, y siempre el mismo color para el mismo jugador", () => {
    const { container, unmount } = render(<AvatarDeJugador nombre="TitoStereo" />);
    const clase = container.firstElementChild!.className;
    expect(container.firstElementChild).toHaveTextContent("T");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    unmount();

    expect(render(<AvatarDeJugador nombre="TitoStereo" />).container.firstElementChild!.className).toBe(clase);
  });
});

describe("TablaDelRanking", () => {
  const filas = [fila(1, "CampeónDelPrado", 2840), fila(2, "TitoStereo", 2670), fila(3, "LaFoca", 2610), fila(4, "OrienteNomade", 2480)];

  it("tiene las columnas del diseño y una fila por jugador con puntaje, racha, precisión y canciones", () => {
    render(<TablaDelRanking filas={filas} me={null} />);

    const tabla = screen.getByRole("table", { name: "Ranking" });
    for (const columna of ["#", "Jugador", "Puntaje", "Racha", "Precisión", "Canciones"]) expect(within(tabla).getByRole("columnheader", { name: columna })).toBeInTheDocument();
    const primera = within(tabla).getAllByRole("row")[1];
    expect(primera).toHaveTextContent("CampeónDelPrado");
    expect(primera).toHaveTextContent("2.840");
    expect(primera).toHaveTextContent("4");
    expect(primera).toHaveTextContent("90%");
    expect(primera).toHaveTextContent("20");
  });

  it("el primero lleva corona; los tres primeros, su propio color; del segundo en adelante, su número", () => {
    const { container } = render(<TablaDelRanking filas={filas} me={null} />);

    expect(screen.getByRole("cell", { name: "Puesto 1" })).toBeInTheDocument();
    expect(container.querySelectorAll("svg.ranking__corona")).toHaveLength(1);
    expect(screen.getByRole("cell", { name: "Puesto 2" })).toHaveTextContent("2");
    expect(container.querySelector("tr.ranking__fila--top1")).not.toBeNull();
    expect(container.querySelector("tr.ranking__fila--top3")).not.toBeNull();
    expect(screen.getByRole("cell", { name: "Puesto 4" })).toHaveTextContent("4");
  });

  it("marca con texto (no solo con color) la fila de quien mira", () => {
    render(<TablaDelRanking filas={filas} me={filas[3]} />);

    expect(within(screen.getByText("OrienteNomade").closest("tr") as HTMLElement).getByText("Vos")).toBeInTheDocument();
  });

  it("lo que el servidor no manda (uno más viejo, o sin estadísticas) se muestra como un guion, no como undefined ni null", () => {
    render(<TablaDelRanking filas={[{ rank: 1, display_name: "Ana", score: 500, games: 2 }]} me={null} />);

    const celdas = within(screen.getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent);
    expect(celdas.join("|")).not.toMatch(/undefined|null|NaN/);
    expect(celdas.filter((t) => t === "—").length).toBeGreaterThanOrEqual(2);
  });

  it("una precisión de cero por ciento es 0%, no un guion", () => {
    render(<TablaDelRanking filas={[fila(1, "Ana", 10, { win_percentage: 0 })]} me={null} />);

    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

describe("TuPosicion", () => {
  const ranking = (me: FilaRanking | null, players?: number): RankingServidor => ({ period: "all", from: null, to: null, entries: [], me, players });

  it("dice el puesto, de cuántos jugadores y los cuatro números", () => {
    render(<TuPosicion ranking={ranking(fila(128, "Brandon", 1860, { current_streak: 9, win_percentage: 81, played: 240 }), 5432)} />);

    const tarjeta = screen.getByRole("region", { name: "Tu posición" });
    expect(tarjeta).toHaveTextContent("#128");
    expect(tarjeta).toHaveTextContent("de 5.432 jugadores");
    for (const texto of ["1.860", "9", "81%", "240"]) expect(tarjeta).toHaveTextContent(texto);
    for (const etiqueta of ["Puntaje", "Racha", "Precisión", "Canciones"]) expect(within(tarjeta).getByText(etiqueta)).toBeInTheDocument();
  });

  it("sin el total de jugadores no dice 'de undefined'", () => {
    render(<TuPosicion ranking={ranking(fila(3, "Ana", 900))} />);

    expect(screen.getByRole("region", { name: "Tu posición" }).textContent).not.toMatch(/undefined|NaN/);
  });

  it("se puede compartir esa posición", () => {
    render(<TuPosicion ranking={ranking(fila(3, "Ana", 900), 50)} />);

    expect(screen.getByRole("button", { name: "Compartir mi posición" })).toBeInTheDocument();
  });

  it("sin puesto invita a jugar en vez de mostrar números vacíos", () => {
    render(<TuPosicion ranking={ranking(null)} />);

    const tarjeta = screen.getByRole("region", { name: "Tu posición" });
    expect(within(tarjeta).getByRole("link", { name: /Jugar el diario/ })).toHaveAttribute("href", "/jugar");
    expect(tarjeta.textContent).not.toMatch(/#|undefined/);
  });

  it("sin puesto no deja un hueco: dice cómo aparecer", () => {
    render(<TuPosicion ranking={ranking(null)} />);

    expect(screen.getByText(/Jugá y guardá tu puntaje para aparecer/)).toBeInTheDocument();
  });
});

describe("ListaDestacada", () => {
  const lista: Destacados["streaks"] = [{ display_name: "CampeónDelPrado", value: 21 }, { display_name: "TitoStereo", value: 18 }];

  it("es un título y una lista numerada con jugador y valor", () => {
    render(<ListaDestacada titulo="Mayor racha" filas={lista} />);

    const region = screen.getByRole("region", { name: "Mayor racha" });
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("CampeónDelPrado");
    expect(items[0]).toHaveTextContent("21");
  });

  it("el valor lleva el sufijo que se le pide (el porcentaje de la precisión)", () => {
    render(<ListaDestacada titulo="Mejor precisión" filas={[{ display_name: "Ana", value: 90 }]} sufijo="%" />);

    expect(screen.getByRole("region", { name: "Mejor precisión" })).toHaveTextContent("90%");
  });

  it("sin datos lo dice en vez de dejar un hueco", () => {
    render(<ListaDestacada titulo="Más canciones" filas={[]} />);

    expect(screen.getByText(/Todavía no hay datos/)).toBeInTheDocument();
  });
});

describe("EstadisticasGlobalesDelJuego", () => {
  it("muestra jugadores, partidas y días de juego con su número formateado", () => {
    render(<EstadisticasGlobalesDelJuego datos={{ players: 5432, games: 12000, days: 124 }} />);

    const region = screen.getByRole("region", { name: "Estadísticas globales" });
    expect(region).toHaveTextContent("5.432");
    expect(region).toHaveTextContent("jugadores");
    expect(region).toHaveTextContent("12.000");
    expect(region).toHaveTextContent("partidas");
    expect(region).toHaveTextContent("124");
    expect(region).toHaveTextContent("canciones del diario");
  });

  it("es una fila de cifras con ícono, sin título propio (el encabezado ya explica de qué es)", () => {
    render(<EstadisticasGlobalesDelJuego datos={{ players: 7, games: 8, days: 2 }} />);

    expect(within(screen.getByRole("region", { name: "Estadísticas globales" })).queryByRole("heading")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("singular cuando es uno", () => {
    render(<EstadisticasGlobalesDelJuego datos={{ players: 1, games: 1, days: 1 }} />);

    expect(screen.getByText("jugador")).toBeInTheDocument();
    expect(screen.getByText("partida")).toBeInTheDocument();
  });

  it("sin datos no aparece (no se muestran ceros inventados)", () => {
    const { container } = render(<EstadisticasGlobalesDelJuego datos={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("LlamadoACuenta", () => {
  it("invita a crear una cuenta para aparecer en el ranking y lleva a entrar", () => {
    render(<LlamadoACuenta />);

    expect(screen.getByRole("heading", { name: /Querés aparecer en el ranking/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Crear cuenta/ })).toHaveAttribute("href", "/login?modo=crear");
  });
});

describe("HeroDelRanking", () => {
  it("tiene el título grande y la bajada, y el podio es decorativo", () => {
    const { container } = render(<HeroDelRanking globales={null} />);

    expect(screen.getByRole("heading", { level: 1, name: /Quién sabe más de música uruguaya/ })).toBeInTheDocument();
    expect(screen.getByText(/Compará tu puntaje, racha y precisión/)).toBeInTheDocument();
    expect(screen.getByText("Ranking global")).toBeInTheDocument();
    expect(container.querySelector(".ranking-podio")).toHaveAttribute("aria-hidden", "true");
  });

  it("lleva las cifras del juego debajo de la bajada, dentro del encabezado", () => {
    const { container } = render(<HeroDelRanking globales={{ players: 7, games: 8, days: 2 }} />);

    expect(container.querySelector(".ranking-hero")).toContainElement(screen.getByRole("region", { name: "Estadísticas globales" }));
  });

  it("sin cifras no deja un hueco ni ceros inventados", () => {
    render(<HeroDelRanking globales={null} />);

    expect(screen.queryByRole("region", { name: "Estadísticas globales" })).toBeNull();
  });
});

describe("ComoSeCalculaElPuntaje", () => {
  it("es un desplegable que explica el puntaje con lo que de verdad cuenta: los intentos y la rapidez", () => {
    render(<ComoSeCalculaElPuntaje />);

    const detalle = screen.getByText("¿Cómo se calcula el puntaje?").closest("details") as HTMLDetailsElement;
    expect(detalle).not.toBeNull();
    expect(detalle.textContent).toMatch(/intentos/);
    expect(detalle.textContent).toMatch(/rápido/);
  });
});

describe("OtrosRecords", () => {
  const datos: Destacados = {
    streaks: [{ display_name: "Ana", value: 5 }],
    songs: [{ display_name: "Beto", value: 12 }],
    accuracy: [{ display_name: "Cata", value: 100 }],
  };

  it("son tres tarjetas, cada una con su lista: mayor racha, mejor precisión (en porcentaje) y más canciones descubiertas", () => {
    render(<OtrosRecords datos={datos} />);

    const conjunto = screen.getByRole("region", { name: "Otros récords" });
    expect(within(conjunto).getByRole("heading", { level: 2, name: "Otros récords" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Mayor racha" })).getByText("Ana")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mejor precisión" })).toHaveTextContent("100%");
    expect(screen.getByRole("region", { name: "Más canciones descubiertas" })).toHaveTextContent("Beto");
  });

  it("con un servidor que todavía no manda la precisión, quedan las otras dos tarjetas", () => {
    render(<OtrosRecords datos={{ streaks: datos.streaks, songs: datos.songs }} />);

    expect(screen.queryByRole("region", { name: "Mejor precisión" })).toBeNull();
    expect(screen.getByRole("region", { name: "Mayor racha" })).toBeInTheDocument();
  });

  it("sin datos no aparece", () => {
    const { container } = render(<OtrosRecords datos={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
