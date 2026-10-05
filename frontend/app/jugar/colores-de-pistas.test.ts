import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const jugar = readFileSync(join(__dirname, "jugar.css"), "utf8");
const globales = readFileSync(join(__dirname, "..", "globals.css"), "utf8");

function variable(nombre: string): string {
  const coincide = globales.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  if (!coincide) throw new Error(`no existe --${nombre}`);
  return coincide[1];
}

function resolver(valor: string): string {
  const referencia = valor.match(/^var\(--([\w-]+)\)$/);
  return referencia ? variable(referencia[1]) : valor;
}

function tono(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const distancia = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

const PISTAS = ["drums", "bass", "other", "vocals"];
const colorDe = (tipo: string) => {
  const regla = jugar.match(new RegExp(`\\.stem--abierta \\.stem__circulo--${tipo}\\s*\\{\\s*background:\\s*([^;]+);`));
  if (!regla) throw new Error(`falta el color de ${tipo}`);
  return resolver(regla[1].trim());
};
const FEEDBACK = ["acierto", "cerca", "error"].map(variable);

describe("colores de los íconos de las pistas", () => {
  it("ninguna pista usa un color (ni un tono parecido) de los que significan acierto, casi o error en la tabla de intentos", () => {
    for (const tipo of PISTAS) {
      for (const feedback of FEEDBACK) {
        expect(colorDe(tipo), `${tipo} igual a ${feedback}`).not.toBe(feedback);
        expect(distancia(tono(colorDe(tipo)), tono(feedback)), `${tipo} (${colorDe(tipo)}) parecida a ${feedback}`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("los colores son de la familia violeta/lavanda de la marca, no colores sueltos", () => {
    for (const tipo of PISTAS) {
      const t = tono(colorDe(tipo));
      expect(t, `${tipo} (${colorDe(tipo)})`).toBeGreaterThanOrEqual(235);
      expect(t, `${tipo} (${colorDe(tipo)})`).toBeLessThanOrEqual(275);
    }
  });

  it("las cuatro pistas se distinguen y van de más clara a más intensa en el orden en que se desbloquean (batería, bajo, otros, voz)", () => {
    const claridad = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b, 0);
    const colores = PISTAS.map(colorDe);

    expect(new Set(colores).size).toBe(4);
    for (let i = 1; i < colores.length; i++) {
      expect(claridad(colores[i]), `${PISTAS[i]} más intensa que ${PISTAS[i - 1]}`).toBeLessThan(claridad(colores[i - 1]));
    }
  });
});
