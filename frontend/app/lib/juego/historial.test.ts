import { describe, expect, it } from "vitest";
import { agregarPartida, diaAnterior, estadisticas, promedioIntentos, ultimosDias, type Partida } from "./historial";

const cancion = { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" };
const partida = (dia: string, ganada: boolean, intentos: number | null = ganada ? 3 : 6, extra: Partial<Partida> = {}): Partida => ({
  dia,
  ganada,
  intentos,
  cancion,
  ...extra,
});

describe("diaAnterior", () => {
  it("resta un día, incluso cruzando mes y año", () => {
    expect(diaAnterior("2026-10-03")).toBe("2026-10-02");
    expect(diaAnterior("2026-10-01")).toBe("2026-09-30");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
    expect(diaAnterior("2024-03-01")).toBe("2024-02-29");
  });
});

describe("agregarPartida", () => {
  it("agrega una partida nueva y deja la lista ordenada por día, de la más vieja a la más nueva", () => {
    const lista = agregarPartida(agregarPartida([], partida("2026-10-03", true)), partida("2026-10-01", false));

    expect(lista.map((p) => p.dia)).toEqual(["2026-10-01", "2026-10-03"]);
  });

  it("guarda una sola partida por día: repetir el día no la duplica", () => {
    const lista = agregarPartida([partida("2026-10-03", true, 3)], partida("2026-10-03", true, 3));

    expect(lista).toHaveLength(1);
  });

  it("al repetir un día completa lo que faltaba sin pisar lo que ya se sabía", () => {
    const antes = partida("2026-10-03", true, null);
    const despues = partida("2026-10-03", true, 4, { feedback: [{ year: "exact", genre: "same", artist: "same", album: "same" }], puntaje: 120 });

    const [unica] = agregarPartida([antes], despues);

    expect(unica.intentos).toBe(4);
    expect(unica.feedback).toHaveLength(1);
    expect(unica.puntaje).toBe(120);

    const [sinPisar] = agregarPartida([unica], partida("2026-10-03", true, null));
    expect(sinPisar.intentos).toBe(4);
    expect(sinPisar.feedback).toHaveLength(1);
  });

  it("conserva el número del juego y lo completa si faltaba", () => {
    const [sin] = agregarPartida([], partida("2026-10-03", true));
    expect(sin.numero).toBeUndefined();

    const [con] = agregarPartida([sin], partida("2026-10-03", true, 3, { numero: 138 }));
    expect(con.numero).toBe(138);

    const [igual] = agregarPartida([con], partida("2026-10-03", true));
    expect(igual.numero).toBe(138);
  });

  it("no modifica la lista que recibe", () => {
    const original = [partida("2026-10-01", true)];

    agregarPartida(original, partida("2026-10-02", true));

    expect(original).toHaveLength(1);
  });
});

describe("estadisticas", () => {
  const hoy = "2026-10-10";

  it("sin partidas todo está en cero y no hay porcentaje", () => {
    expect(estadisticas([], hoy)).toEqual({
      jugadas: 0,
      ganadas: 0,
      porcentaje: null,
      rachaActual: 0,
      rachaMaxima: 0,
      distribucion: [0, 0, 0, 0, 0, 0],
    });
  });

  it("cuenta jugadas, ganadas y el porcentaje de aciertos redondeado", () => {
    const lista = [partida("2026-10-01", true), partida("2026-10-02", true), partida("2026-10-03", false)];

    const e = estadisticas(lista, hoy);

    expect(e.jugadas).toBe(3);
    expect(e.ganadas).toBe(2);
    expect(e.porcentaje).toBe(67);
  });

  it("reparte las partidas ganadas según en cuántos intentos salieron", () => {
    const lista = [partida("2026-10-01", true, 1), partida("2026-10-02", true, 3), partida("2026-10-03", true, 3), partida("2026-10-04", false, 6)];

    expect(estadisticas(lista, hoy).distribucion).toEqual([1, 0, 2, 0, 0, 0]);
  });

  it("ignora en la distribución las ganadas de las que no se sabe el número de intentos", () => {
    const lista = [partida("2026-10-01", true, null), partida("2026-10-02", true, 2)];

    const e = estadisticas(lista, hoy);

    expect(e.ganadas).toBe(2);
    expect(e.distribucion).toEqual([0, 1, 0, 0, 0, 0]);
  });

  describe("racha (días seguidos ganando)", () => {
    it("cuenta los días ganados seguidos hasta hoy", () => {
      const lista = [partida("2026-10-08", true), partida("2026-10-09", true), partida("2026-10-10", true)];

      expect(estadisticas(lista, hoy).rachaActual).toBe(3);
    });

    it("si hoy todavía no se jugó, la racha sigue viva con lo de ayer", () => {
      const lista = [partida("2026-10-08", true), partida("2026-10-09", true)];

      expect(estadisticas(lista, hoy).rachaActual).toBe(2);
    });

    it("si ayer no se jugó y hoy tampoco, la racha se cortó", () => {
      const lista = [partida("2026-10-07", true), partida("2026-10-08", true)];

      expect(estadisticas(lista, hoy).rachaActual).toBe(0);
    });

    it("perder hoy corta la racha, y perder otro día también", () => {
      expect(estadisticas([partida("2026-10-09", true), partida("2026-10-10", false)], hoy).rachaActual).toBe(0);
      expect(estadisticas([partida("2026-10-08", false), partida("2026-10-09", true)], hoy).rachaActual).toBe(1);
    });

    it("un día salteado en el medio corta la racha", () => {
      const lista = [partida("2026-10-06", true), partida("2026-10-07", true), partida("2026-10-09", true), partida("2026-10-10", true)];

      const e = estadisticas(lista, hoy);

      expect(e.rachaActual).toBe(2);
      expect(e.rachaMaxima).toBe(2);
    });

    it("la racha máxima recuerda la mejor tanda aunque ya haya terminado", () => {
      const lista = [
        partida("2026-09-01", true),
        partida("2026-09-02", true),
        partida("2026-09-03", true),
        partida("2026-09-04", false),
        partida("2026-10-10", true),
      ];

      const e = estadisticas(lista, hoy);

      expect(e.rachaMaxima).toBe(3);
      expect(e.rachaActual).toBe(1);
    });
  });
});

describe("ultimosDias", () => {
  const hoy = "2026-10-10";

  it("devuelve los últimos N días hasta hoy, del más viejo al más nuevo", () => {
    expect(ultimosDias([], hoy, 3).map((d) => d.dia)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
  });

  it("marca cada día como ganado, perdido, sin jugar o pendiente (hoy sin jugar)", () => {
    const lista = [partida("2026-10-08", true), partida("2026-10-09", false)];

    expect(ultimosDias(lista, hoy, 4).map((d) => d.estado)).toEqual(["sin-jugar", "ganada", "perdida", "pendiente"]);
  });

  it("hoy ya jugado aparece como ganado o perdido, no como pendiente", () => {
    expect(ultimosDias([partida("2026-10-10", true)], hoy, 1)[0].estado).toBe("ganada");
    expect(ultimosDias([partida("2026-10-10", false)], hoy, 1)[0].estado).toBe("perdida");
  });
});

describe("promedioIntentos", () => {
  it("promedia los intentos de las partidas ganadas, con un decimal", () => {
    expect(promedioIntentos([1, 0, 2, 0, 0, 0])).toBe(2.3);
    expect(promedioIntentos([0, 0, 0, 0, 0, 4])).toBe(6);
  });

  it("es null si todavía no hay ninguna ganada con intentos conocidos", () => {
    expect(promedioIntentos([0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
