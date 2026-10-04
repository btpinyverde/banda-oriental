import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoEncontrada } from "./NoEncontrada";

afterEach(cleanup);

describe("NoEncontrada: contenido", () => {
  it("dice ERROR 404 y el título principal", () => {
    render(<NoEncontrada />);

    expect(screen.getByText("ERROR 404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("El 404 sí existe. Esta página no.");
  });

  it("explica que el 404 es un ómnibus real y marca los dos puntos que conecta", () => {
    render(<NoEncontrada />);

    expect(screen.getByText(/El 404 es un ómnibus real de Montevideo que conecta dos puntos de la ciudad/)).toBeInTheDocument();
    expect(screen.getByText("Palacio de la Luz ⇄ Complejo Juana de América.")).toBeInTheDocument();
  });

  it("aclara en qué se diferencia el error 404 de internet", () => {
    render(<NoEncontrada />);

    expect(
      screen.getByText("En cambio, el error 404 aparece cuando intentás llegar a una página que no existe."),
    ).toBeInTheDocument();
  });

  it("muestra el recorrido del 404 entre los dos puntos", () => {
    render(<NoEncontrada />);

    const recorrido = screen.getByRole("group", { name: "Recorrido del 404" });
    expect(within(recorrido).getByText("Palacio de la Luz")).toBeInTheDocument();
    expect(within(recorrido).getByText("Complejo Juana de América")).toBeInTheDocument();
  });

  it("ofrece volver al inicio y explorar el archivo", () => {
    render(<NoEncontrada />);

    expect(screen.getByRole("link", { name: /Volver al inicio/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Explorar el archivo/ })).toHaveAttribute("href", "/archivo");
  });

  it("nombra el destino como complejo, en el texto, en el recorrido y en la descripción de la foto", () => {
    render(<NoEncontrada fotos={{ bus: "/assets/404/bus404.webp" }} />);

    expect(screen.queryByText(/Palacio de la Luz ⇄ Juana de América/)).toBeNull();
    expect(screen.getByRole("img", { name: /con destino Palacio de la Luz – Complejo Juana de América/ })).toBeInTheDocument();
  });

  it("la nota rosa del collage lleva el chiste como texto alternativo, para que no se pierda", () => {
    render(<NoEncontrada />);

    expect(screen.getByRole("img", { name: "El 404 te lleva de un lado al otro. Esta página, a ninguno." })).toBeInTheDocument();
  });
});

describe("NoEncontrada: foto del ómnibus", () => {
  it("mientras no está la foto deja un espacio decorativo, sin imagen rota", () => {
    const { container } = render(<NoEncontrada />);

    const vacia = container.querySelector(".nf__foto--vacia");
    expect(vacia).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img[src*='bus-404']")).toBeNull();
  });

  it("cuando llega la foto la muestra con un texto alternativo que la describe", () => {
    const { container } = render(<NoEncontrada fotos={{ bus: "/assets/404/bus-404.webp" }} />);

    expect(screen.getByRole("img", { name: /Ómnibus de la línea 404/ })).toHaveAttribute("src", "/assets/404/bus-404.webp");
    expect(container.querySelector(".nf__foto--vacia")).toBeNull();
  });
});

describe("NoEncontrada: adornos", () => {
  it("fuera de la nota y la foto, los gráficos decorativos no se leen en voz alta", () => {
    const { container } = render(<NoEncontrada fotos={{ bus: "/assets/404/bus-404.webp" }} />);

    const conTexto = [...container.querySelectorAll("img")].filter((imagen) => imagen.getAttribute("alt"));
    expect(conTexto).toHaveLength(2);
  });
});
