import { describe, expect, it } from "vitest";
import { elegirChips } from "./generos";

describe("elegirChips", () => {
  it("pone primero los géneros de siempre en su orden, con su nombre de siempre", () => {
    const chips = elegirChips(["pop", "tango", "rock", "candombe", "classical"]);

    expect(chips.slice(0, 4)).toEqual([
      { valor: "rock", etiqueta: "Rock" },
      { valor: "pop", etiqueta: "Pop" },
      { valor: "candombe", etiqueta: "Candombe" },
      { valor: "tango", etiqueta: "Tango" },
    ]);
  });

  it("reconoce los sinónimos y filtra por el género tal como está en el catálogo", () => {
    const chips = elegirChips(["Rap/Hip Hop", "Electro", "Alternativo"]);

    expect(chips).toContainEqual({ valor: "Rap/Hip Hop", etiqueta: "Hip hop" });
    expect(chips).toContainEqual({ valor: "Electro", etiqueta: "Electrónica" });
  });

  it("después de los de siempre completa con los más frecuentes del catálogo, sin repetir", () => {
    const chips = elegirChips(["Rock", "Latino", "Clásica", "Rock"], 4);

    expect(chips.map((c) => c.etiqueta)).toEqual(["Rock", "Latino", "Clásica"]);
  });

  it("no pasa del máximo", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `Género ${i}`);

    expect(elegirChips(muchos, 7)).toHaveLength(7);
  });

  it("un género que no está en el catálogo no se ofrece (no se inventa un chip que no encuentra nada)", () => {
    expect(elegirChips(["Rock"]).map((c) => c.etiqueta)).toEqual(["Rock"]);
  });

  it("ignora los vacíos", () => {
    expect(elegirChips(["", "  ", "Rock"]).map((c) => c.etiqueta)).toEqual(["Rock"]);
  });

  it("sin géneros no hay chips", () => {
    expect(elegirChips([])).toEqual([]);
  });
});
