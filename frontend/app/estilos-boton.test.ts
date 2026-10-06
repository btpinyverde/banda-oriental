import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");
const bloque = (selector: string) => new RegExp(`(^|\\n)${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? "";

describe("el botón del sitio", () => {
  // Un <button class="boton"> (el de enviar, el de abrir las instrucciones del juego…) trae el borde 3D del navegador si no se lo saca:
  // los enlaces <a class="boton"> no, y por eso se veían distintos.
  it("saca el borde y la apariencia propios del navegador, así un <button> es igual de plano que un enlace", () => {
    const base = bloque(".boton");

    expect(base).toMatch(/border:\s*0/);
    expect(base).toMatch(/font-family:\s*inherit/);
  });

  it("no lleva sombras ni relieve: queda plano", () => {
    expect(bloque(".boton")).not.toMatch(/box-shadow|outset|ridge/);
    expect(bloque(".boton--violeta")).not.toMatch(/box-shadow|border/);
  });
});
