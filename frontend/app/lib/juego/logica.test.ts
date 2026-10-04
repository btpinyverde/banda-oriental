import { describe, expect, it } from "vitest";
import {
  claseCelda,
  etapasDeStems,
  etiquetaDelDia,
  flechaAnio,
  formatoCuentaAtras,
  diaDeMontevideo,
  nombreValido,
  normalizarTexto,
  segundosHastaMedianoche,
  pistasParaMezclar,
} from "./logica";
import type { StemInfo } from "./tipos";

const stem = (stem_type: StemInfo["stem_type"], unlock_order: number): StemInfo => ({
  stem_type,
  unlock_order,
  url: `https://audio.example/${stem_type}.mp3`,
});

describe("claseCelda", () => {
  it("pinta el año exacto como acierto y el año distinto como cerca", () => {
    expect(claseCelda("year", "exact")).toBe("acierto");
    expect(claseCelda("year", "newer")).toBe("cerca");
    expect(claseCelda("year", "older")).toBe("cerca");
  });

  it("pinta género, artista y disco iguales como acierto y distintos como error", () => {
    for (const eje of ["genre", "artist", "album"] as const) {
      expect(claseCelda(eje, "same")).toBe("acierto");
      expect(claseCelda(eje, "different")).toBe("error");
    }
  });

  it("deja neutra la celda cuando el backend no pudo comparar", () => {
    expect(claseCelda("year", "unknown")).toBe("desconocido");
    expect(claseCelda("genre", "unknown")).toBe("desconocido");
  });
});

describe("flechaAnio", () => {
  it("apunta hacia arriba si la canción correcta es más nueva y hacia abajo si es más vieja", () => {
    expect(flechaAnio("newer")).toBe("↑");
    expect(flechaAnio("older")).toBe("↓");
  });

  it("no pone flecha si el año es exacto o desconocido", () => {
    expect(flechaAnio("exact")).toBe("");
    expect(flechaAnio("unknown")).toBe("");
  });
});

describe("etapasDeStems", () => {
  it("muestra siempre las cuatro pistas en el mismo lugar: Batería, Bajo, Otros y Voz", () => {
    const etapas = etapasDeStems([stem("drums", 1)]);

    expect(etapas.map((e) => e.etiqueta)).toEqual(["Batería", "Bajo", "Otros", "Voz"]);
  });

  it("marca como abiertas solo las que llegaron, sin mover de lugar a ninguna", () => {
    const etapas = etapasDeStems([stem("drums", 1), stem("bass", 2)]);

    expect(etapas.map((e) => [e.etiqueta, e.desbloqueada])).toEqual([
      ["Batería", true],
      ["Bajo", true],
      ["Otros", false],
      ["Voz", false],
    ]);
  });

  it("el orden en que el backend desbloquea las pistas no cambia el orden en pantalla: la voz va última", () => {
    const etapas = etapasDeStems([stem("vocals", 1), stem("other", 2)]);

    expect(etapas.map((e) => [e.etiqueta, e.desbloqueada])).toEqual([
      ["Batería", false],
      ["Bajo", false],
      ["Otros", true],
      ["Voz", true],
    ]);
  });

  it("numera cada pista según el orden en que se desbloquea: el del backend si ya llegó, el habitual si no", () => {
    const etapas = etapasDeStems([stem("drums", 1), stem("bass", 2)]);

    expect(etapas.map((e) => [e.etiqueta, e.pista])).toEqual([
      ["Batería", 1],
      ["Bajo", 2],
      ["Otros", 3],
      ["Voz", 4],
    ]);
  });

  it("usa el número que mande el backend aunque difiera del habitual", () => {
    const etapas = etapasDeStems([stem("vocals", 2)]);

    expect(etapas.find((e) => e.tipo === "vocals")?.pista).toBe(2);
  });

  it("con las cuatro abiertas no queda ninguna bloqueada", () => {
    const etapas = etapasDeStems([stem("drums", 1), stem("bass", 2), stem("other", 3), stem("vocals", 4)]);

    expect(etapas.every((e) => e.desbloqueada)).toBe(true);
  });
});

describe("pistasParaMezclar", () => {
  it("devuelve todas las pistas desbloqueadas, porque suenan juntas", () => {
    const pistas = pistasParaMezclar("2026-10-03", [stem("drums", 1), stem("bass", 2)]);

    expect(pistas.map((p) => p.url)).toEqual(["https://audio.example/drums.mp3", "https://audio.example/bass.mp3"]);
  });

  it("identifica cada pista por día y tipo, no por su dirección firmada (que cambia en cada pedido)", () => {
    const [bateria] = pistasParaMezclar("2026-10-03", [stem("drums", 1)]);

    expect(bateria.clave).toBe("2026-10-03:drums");
  });

  it("devuelve una lista vacía si no hay ninguna", () => {
    expect(pistasParaMezclar("2026-10-03", [])).toEqual([]);
  });
});

describe("segundosHastaMedianoche", () => {
  it("cuenta hasta la medianoche de Montevideo (UTC-3)", () => {
    expect(segundosHastaMedianoche(new Date("2026-10-03T12:00:00Z"))).toBe(15 * 3600);
  });

  it("queda en 1 segundo a las 23:59:59 locales", () => {
    expect(segundosHastaMedianoche(new Date("2026-10-04T02:59:59Z"))).toBe(1);
  });

  it("a la medianoche exacta arranca un día nuevo", () => {
    expect(segundosHastaMedianoche(new Date("2026-10-04T03:00:00Z"))).toBe(86400);
  });
});

describe("formatoCuentaAtras", () => {
  it("escribe horas, minutos y segundos con dos dígitos", () => {
    expect(formatoCuentaAtras(12 * 3600 + 36 * 60 + 8)).toBe("12:36:08");
    expect(formatoCuentaAtras(59)).toBe("00:00:59");
  });

  it("no baja de cero", () => {
    expect(formatoCuentaAtras(-5)).toBe("00:00:00");
  });
});

describe("etiquetaDelDia", () => {
  it("usa el número del juego cuando el backend lo manda", () => {
    expect(etiquetaDelDia({ day: "2026-10-03", number: 138 })).toBe("#138");
  });

  it("usa la fecha corta mientras el backend no mande el número", () => {
    expect(etiquetaDelDia({ day: "2026-10-03" })).toBe("3 oct");
    expect(etiquetaDelDia({ day: "2026-01-15" })).toBe("15 ene");
  });
});

describe("nombreValido", () => {
  it("acepta de 1 a 50 caracteres sin contar los espacios de los bordes", () => {
    expect(nombreValido("  brandon ")).toBe("brandon");
    expect(nombreValido("a".repeat(50))).toBe("a".repeat(50));
  });

  it("rechaza vacío, solo espacios y más de 50", () => {
    expect(nombreValido("")).toBeNull();
    expect(nombreValido("   ")).toBeNull();
    expect(nombreValido("a".repeat(51))).toBeNull();
  });
});

describe("normalizarTexto", () => {
  it("ignora mayúsculas, tildes y signos para poder comparar y buscar", () => {
    expect(normalizarTexto("  Rubén  RADA!! ")).toBe("ruben rada");
    expect(normalizarTexto("Al otro lado del río")).toBe(normalizarTexto("al otro lado del rio"));
  });

  it("deja distintas las palabras distintas", () => {
    expect(normalizarTexto("No Te Va Gustar")).not.toBe(normalizarTexto("No Te Va A Gustar"));
  });
});

describe("diaDeMontevideo", () => {
  it("devuelve la fecha de Montevideo (UTC-3), no la del reloj universal", () => {
    expect(diaDeMontevideo(new Date("2026-10-03T12:00:00Z"))).toBe("2026-10-03");
    expect(diaDeMontevideo(new Date("2026-10-04T02:59:59Z"))).toBe("2026-10-03");
  });

  it("cambia de día a la medianoche de Montevideo", () => {
    expect(diaDeMontevideo(new Date("2026-10-04T03:00:00Z"))).toBe("2026-10-04");
  });
});


describe("nombreValido cuenta caracteres como el servidor (no unidades de UTF-16)", () => {
  it("50 emojis son 50 caracteres: valen", () => {
    expect(nombreValido("😀".repeat(50))).toBe("😀".repeat(50));
  });

  it("51 emojis son demasiados", () => {
    expect(nombreValido("😀".repeat(51))).toBeNull();
  });
});
