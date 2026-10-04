import { beforeEach, describe, expect, it } from "vitest";
import { marcarTutorialVisto, tutorialVisto } from "./visto";

beforeEach(() => window.localStorage.clear());

describe("tutorial visto", () => {
  it("empieza sin verse", () => {
    expect(tutorialVisto()).toBe(false);
  });

  it("se recuerda en este dispositivo", () => {
    marcarTutorialVisto();

    expect(tutorialVisto()).toBe(true);
  });

  it("no se guarda con el prefijo de los datos del día, que se borran al cambiar de día", () => {
    marcarTutorialVisto();

    expect(window.localStorage.key(0)).not.toMatch(/^banda-oriental:juego:/);
  });

  it("si el almacenamiento está bloqueado no se rompe (y se considera visto para no insistir en cada visita)", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("bloqueado");
    };
    try {
      expect(tutorialVisto()).toBe(true);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
