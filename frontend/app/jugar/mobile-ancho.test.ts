import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * jsdom no calcula el layout, así que esto vigila las reglas que evitan que algo del juego sea más ancho que la pantalla
 * del celular (pasó: el botón de enviar del buscador quedaba fuera de pantalla en un iPhone de 390 px).
 */
const css = readFileSync(join(__dirname, "jugar.css"), "utf8") + readFileSync(join(__dirname, "tutorial.css"), "utf8");
const bloqueMovil = css.slice(css.indexOf("@media (max-width: 860px)"));

describe("el juego en celular nunca es más ancho que la pantalla", () => {
  it("la tarjeta del juego tiene una sola columna que se achica (minmax(0, 1fr)), no una que crece con el contenido", () => {
    expect(bloqueMovil).toMatch(/\.jugar__tarjeta\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("la fila del título puede partirse en dos líneas en vez de empujar el ancho de todo", () => {
    expect(bloqueMovil).toMatch(/\.jugar__titulo-fila\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it("el botón para ver el tutorial no empuja el título: pasa a su propia línea en celular", () => {
    expect(bloqueMovil).toMatch(/\.tutorial__reabrir\s*\{[^}]*(flex-basis:\s*100%|margin-left:\s*0)/);
  });

  it("el buscador y su campo pueden achicarse (min-width: 0) para que el botón de enviar siempre entre", () => {
    expect(css).toMatch(/\.buscador\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.buscador__campo input\s*\{[^}]*min-width:\s*0/);
  });
});
