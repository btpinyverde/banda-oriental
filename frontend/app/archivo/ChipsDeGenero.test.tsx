import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChipsDeGenero } from "./ChipsDeGenero";

afterEach(cleanup);

describe("ChipsDeGenero", () => {
  it("ofrece 'Todas' y los géneros, cada uno un enlace que conserva los demás filtros", () => {
    render(<ChipsDeGenero generos={["Rock", "Pop"]} actual={undefined} parametros={{ q: "luna", decada: "1990" }} />);

    expect(screen.getByRole("link", { name: "Todas" })).toHaveAttribute("href", "/archivo?q=luna&decada=1990");
    expect(screen.getByRole("link", { name: "Rock" })).toHaveAttribute("href", "/archivo?q=luna&decada=1990&genero=Rock");
  });

  it("marca el género elegido (sin importar mayúsculas) y no 'Todas'", () => {
    render(<ChipsDeGenero generos={["Rock", "Pop"]} actual="rock" parametros={{}} />);

    expect(screen.getByRole("link", { name: "Rock" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Todas" })).not.toHaveAttribute("aria-current");
  });

  it("sin género elegido está marcada 'Todas'", () => {
    render(<ChipsDeGenero generos={["Rock"]} actual={undefined} parametros={{}} />);

    expect(screen.getByRole("link", { name: "Todas" })).toHaveAttribute("aria-current", "true");
  });

  it("al elegir un género se vuelve a la primera página", () => {
    render(<ChipsDeGenero generos={["Rock"]} actual={undefined} parametros={{ pagina: "4", q: "x" }} />);

    expect(screen.getByRole("link", { name: "Rock" }).getAttribute("href")).not.toContain("pagina");
  });

  it("un género con caracteres especiales se escapa", () => {
    render(<ChipsDeGenero generos={["R&B / Soul"]} actual={undefined} parametros={{}} />);

    expect(screen.getByRole("link", { name: "R&B / Soul" })).toHaveAttribute("href", "/archivo?genero=R%26B+%2F+Soul");
  });

  it("si el género elegido no está entre los ofrecidos igual se ve (para poder sacarlo)", () => {
    render(<ChipsDeGenero generos={["Rock"]} actual="Fado" parametros={{}} />);

    expect(screen.getByRole("link", { name: "Fado" })).toHaveAttribute("aria-current", "true");
  });

  it("con `conOtros` suma un chip que lleva al selector de géneros", () => {
    render(<ChipsDeGenero conOtros generos={["Rock"]} actual={undefined} parametros={{}} />);

    expect(screen.getByRole("link", { name: "Otros" })).toHaveAttribute("href", "#filtro-generos");
  });

  it("sin `conOtros` no está", () => {
    render(<ChipsDeGenero generos={["Rock"]} actual={undefined} parametros={{}} />);

    expect(screen.queryByRole("link", { name: "Otros" })).toBeNull();
  });
});
