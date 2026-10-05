import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FotoDelArtista, inicialDe } from "./FotoDelArtista";

afterEach(cleanup);

describe("inicialDe", () => {
  it("la primera letra o número, en mayúscula y con tilde si la tiene", () => {
    expect(inicialDe("Jorge Drexler")).toBe("J");
    expect(inicialDe("ñandú")).toBe("Ñ");
    expect(inicialDe("Álvaro")).toBe("Á");
    expect(inicialDe("#TocoParaVos")).toBe("T");
    expect(inicialDe("¡Ay! Caramba")).toBe("A");
    expect(inicialDe("3Pecados")).toBe("3");
    expect(inicialDe("???")).toBe("·");
  });
});

describe("FotoDelArtista", () => {
  it("con foto muestra la foto del artista", () => {
    render(<FotoDelArtista nombre="Jorge Drexler" foto="https://cdn.example/d.jpg" />);

    const foto = screen.getByRole("img", { name: "Foto de Jorge Drexler" });
    expect(foto).toHaveAttribute("src", "https://cdn.example/d.jpg");
    expect(foto).toHaveAttribute("loading", "lazy");
    expect(document.querySelector(".artista__inicial")).toBeNull();
  });

  it("sin foto va la inicial sobre un color de la marca, siempre el mismo para el mismo nombre", () => {
    const { container, unmount } = render(<FotoDelArtista nombre="Rubén Rada" />);
    const clase = container.firstElementChild!.className;
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector(".artista__inicial")).toHaveTextContent("R");
    expect(clase).toMatch(/artista__foto--tono-\d/);
    unmount();

    const otra = render(<FotoDelArtista nombre="Rubén Rada" />);
    expect(otra.container.firstElementChild!.className).toBe(clase);
  });

  it("si la imagen no se puede cargar vuelve a la inicial, sin dejar una imagen rota", () => {
    const { container } = render(<FotoDelArtista nombre="Jorge Drexler" foto="https://cdn.example/rota.jpg" />);

    fireEvent.error(screen.getByRole("img"));

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector(".artista__inicial")).toHaveTextContent("J");
  });

  it("una foto nueva (otro artista) se intenta de nuevo aunque la anterior hubiera fallado", () => {
    const { rerender } = render(<FotoDelArtista nombre="A" foto="https://cdn/a.jpg" />);
    fireEvent.error(screen.getByRole("img"));

    rerender(<FotoDelArtista nombre="B" foto="https://cdn/b.jpg" />);

    expect(screen.getByRole("img", { name: "Foto de B" })).toBeInTheDocument();
  });

  it("solo se aceptan fotos por https (nada de javascript: ni http)", () => {
    for (const foto of ["javascript:alert(1)", "http://inseguro/x.jpg", "data:image/png;base64,AAAA"]) {
      const { container, unmount } = render(<FotoDelArtista nombre="X" foto={foto} />);
      expect(screen.queryByRole("img")).toBeNull();
      expect(container.querySelector(".artista__inicial")).not.toBeNull();
      unmount();
    }
  });
});
