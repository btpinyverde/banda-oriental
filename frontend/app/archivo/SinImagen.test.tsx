import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SinImagen } from "./SinImagen";

afterEach(cleanup);

describe("SinImagen", () => {
  it("una canción lleva la nota negra sobre papel, con el asterisco del logo", () => {
    const { container } = render(<SinImagen tipo="cancion" lugar={0} />);

    const bloque = container.querySelector(".tarjeta__tapa--sin.tarjeta__tapa--vacia");
    expect(bloque).not.toBeNull();
    expect(bloque?.querySelector("img.vacia__simbolo")).toHaveAttribute("src", "/assets/icon-note.svg");
    expect(bloque?.querySelector(".vacia__asterisco")).not.toBeNull();
  });

  it("un disco y un artista llevan el vinilo", () => {
    const { container, rerender } = render(<SinImagen tipo="disco" lugar={0} />);
    expect(container.querySelector("img.vacia__simbolo")).toHaveAttribute("src", "/assets/vinilo.svg");

    rerender(<SinImagen tipo="artista" lugar={0} />);
    expect(container.querySelector("img.vacia__simbolo")).toHaveAttribute("src", "/assets/vinilo.svg");
  });

  it("el color del asterisco cambia con el lugar, así las vecinas no salen iguales, y vuelve a empezar al terminar la paleta", () => {
    const tono = (lugar: number) => {
      const { container, unmount } = render(<SinImagen tipo="cancion" lugar={lugar} />);
      const clase = container.querySelector(".vacia__asterisco")!.className;
      unmount();
      return clase;
    };

    const colores = [0, 1, 2, 3, 4].map(tono);
    expect(new Set(colores).size).toBe(5);
    expect(tono(5)).toBe(colores[0]);
  });

  it("es decorativo: no se lee en voz alta", () => {
    const { container } = render(<SinImagen tipo="cancion" lugar={0} />);

    expect(container.querySelector(".tarjeta__tapa--vacia")).toHaveAttribute("aria-hidden", "true");
  });
});
