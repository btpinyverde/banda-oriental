import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuscadorCanciones } from "./BuscadorCanciones";
import type { BuscarCanciones, CancionCatalogo } from "../lib/juego/tipos";

afterEach(cleanup);

const cancion = (id: number, title: string, artist: string, extra: Partial<CancionCatalogo> = {}): CancionCatalogo => ({ id, title, artist, album: "Disco", year: 2000, genre: "Rock", ...extra });

const CANCIONES = [
  cancion(1, "A las nueve", "No Te Va Gustar"),
  cancion(2, "Sin saber", "No Te Va Gustar"),
  cancion(3, "Cuando sea grande", "El Cuarteto de Nos"),
  cancion(4, "Candombe para Gardel", "Rubén Rada"),
];

const POR_PAGINA = 20;
const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Un servidor de mentira: busca (todas las palabras, sin tildes ni mayúsculas) y devuelve de a páginas, como la API. */
function servidor(catalogo: CancionCatalogo[]) {
  const buscar = vi.fn<BuscarCanciones>(async (texto, pagina) => {
    const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
    const todas = catalogo.filter((c) => palabras.every((p) => sinTildes(`${c.title} ${c.artist} ${c.album}`).includes(p)));
    const desde = (pagina - 1) * POR_PAGINA;
    return { canciones: todas.slice(desde, desde + POR_PAGINA), hayMas: todas.length > desde + POR_PAGINA };
  });
  return buscar;
}

function montar(extra: Partial<Parameters<typeof BuscadorCanciones>[0]> = {}, catalogo = CANCIONES) {
  const alEnviar = vi.fn();
  const buscar = extra.buscar ?? servidor(catalogo);
  render(<BuscadorCanciones buscar={buscar} esperaMs={0} puedeEnviar alEnviar={alEnviar} {...extra} />);
  return { alEnviar, buscar: buscar as ReturnType<typeof servidor>, campo: screen.getByRole("combobox") as HTMLInputElement };
}

/** Simula llegar al final de la lista con scroll (jsdom no calcula medidas, hay que fijarlas). */
function alFinalDelScroll(lista: HTMLElement, medidas: { scrollTop?: number } = {}) {
  Object.defineProperty(lista, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(lista, "clientHeight", { configurable: true, value: 300 });
  Object.defineProperty(lista, "scrollTop", { configurable: true, value: medidas.scrollTop ?? 700 });
  fireEvent.scroll(lista);
}

const escribir = (campo: HTMLElement, texto: string) => fireEvent.change(campo, { target: { value: texto } });
const enviar = () => screen.getByRole("button", { name: "Enviar intento" });
const opciones = () => screen.getAllByRole("option");
const muchas = (n: number) => Array.from({ length: n }, (_, i) => cancion(i + 1, `Tema ${String(i + 1).padStart(2, "0")}`, "Artista"));

describe("BuscadorCanciones: buscar en el servidor, de a páginas", () => {
  it("no muestra la lista ni busca hasta que se escribe; enfocar el campo no alcanza", () => {
    const { campo, buscar } = montar();

    fireEvent.focus(campo);
    fireEvent.click(campo);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });

  it("con una sola letra o solo espacios no busca nada (no se pide el catálogo entero)", async () => {
    const { campo, buscar } = montar();

    escribir(campo, "c");
    escribir(campo, "    ");
    await new Promise((r) => setTimeout(r, 30));

    expect(buscar).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("al escribir pide la primera página de lo escrito y muestra lo que vuelve", async () => {
    const { campo, buscar } = montar();

    escribir(campo, "candombe");

    expect(await screen.findByRole("option", { name: /Candombe para Gardel/ })).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith("candombe", 1, expect.any(AbortSignal));
  });

  it("espera a que se deje de teclear: varias teclas seguidas son un solo pedido, con lo último escrito", async () => {
    const { campo, buscar } = montar({ esperaMs: 40 });

    escribir(campo, "ca");
    escribir(campo, "can");
    escribir(campo, "cand");
    await screen.findByRole("option", { name: /Candombe para Gardel/ });

    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0][0]).toBe("cand");
  });

  it("le pasa al servidor el texto sin espacios de más", async () => {
    const { campo, buscar } = montar();

    escribir(campo, "  no   te va ");
    await screen.findAllByRole("option");

    expect(buscar.mock.calls[0][0]).toBe("no te va");
  });

  it("muestra el artista, el disco y el año de cada opción, sin separadores sueltos cuando falta algo", async () => {
    const { campo } = montar({}, [cancion(4, "Candombe para Gardel", "Rubén Rada"), cancion(5, "Candombe sin datos", "Rubén Rada", { year: null, album: "" })]);

    escribir(campo, "candombe");
    await screen.findAllByRole("option");

    expect(opciones()[0]).toHaveTextContent("Rubén Rada · Disco · 2000");
    expect(opciones()[1]).toHaveTextContent(/^Candombe sin datosRubén Rada$/);
  });

  it("respeta el orden que manda el servidor (ya viene con las mejores coincidencias primero)", async () => {
    const { campo } = montar({}, [cancion(1, "Zeta", "A"), cancion(2, "Alfa", "A"), cancion(3, "Beta", "A")]);

    escribir(campo, "disco");
    await waitFor(() => expect(opciones()).toHaveLength(3));

    expect(opciones().map((o) => o.querySelector(".buscador__titulo")?.textContent)).toEqual(["Zeta", "Alfa", "Beta"]);
  });

  it("al llegar al final del scroll pide la página siguiente y la suma a lo que ya había", async () => {
    const { campo, buscar } = montar({}, muchas(45));

    escribir(campo, "artista");
    await waitFor(() => expect(opciones()).toHaveLength(20));

    alFinalDelScroll(screen.getByRole("listbox"));
    await waitFor(() => expect(opciones()).toHaveLength(40));
    expect(buscar).toHaveBeenLastCalledWith("artista", 2, expect.any(AbortSignal));

    alFinalDelScroll(screen.getByRole("listbox"));
    await waitFor(() => expect(opciones()).toHaveLength(45));
    expect(new Set(opciones().map((o) => o.id)).size).toBe(45); // nada repetido
  });

  it("no pide más mientras el scroll está lejos del final, ni cuando ya no hay más", async () => {
    const { campo, buscar } = montar({}, muchas(25));

    escribir(campo, "artista");
    await waitFor(() => expect(opciones()).toHaveLength(20));
    alFinalDelScroll(screen.getByRole("listbox"), { scrollTop: 0 });
    expect(buscar).toHaveBeenCalledTimes(1);

    alFinalDelScroll(screen.getByRole("listbox"));
    await waitFor(() => expect(opciones()).toHaveLength(25));
    alFinalDelScroll(screen.getByRole("listbox"));
    await new Promise((r) => setTimeout(r, 20));
    expect(buscar).toHaveBeenCalledTimes(2); // la segunda página era la última
  });

  it("no pide la misma página dos veces si se scrollea varias veces seguidas mientras carga", async () => {
    const { campo, buscar } = montar({}, muchas(60));

    escribir(campo, "artista");
    await waitFor(() => expect(opciones()).toHaveLength(20));
    const lista = screen.getByRole("listbox");
    alFinalDelScroll(lista);
    alFinalDelScroll(lista);
    alFinalDelScroll(lista);
    await waitFor(() => expect(opciones()).toHaveLength(40));

    expect(buscar.mock.calls.filter(([, pagina]) => pagina === 2)).toHaveLength(1);
  });

  it("una búsqueda nueva vuelve a empezar desde la primera página", async () => {
    const { campo, buscar } = montar({}, [...muchas(45), cancion(100, "Otro", "Otra banda")]);

    escribir(campo, "artista");
    await waitFor(() => expect(opciones()).toHaveLength(20));
    alFinalDelScroll(screen.getByRole("listbox"));
    await waitFor(() => expect(opciones()).toHaveLength(40));
    escribir(campo, "tema");

    await waitFor(() => expect(opciones()).toHaveLength(20));
    expect(buscar).toHaveBeenLastCalledWith("tema", 1, expect.any(AbortSignal));
  });

  it("con el teclado, al llegar a la última opción cargada se pide la página siguiente y se puede seguir bajando", async () => {
    const { campo } = montar({}, muchas(45));

    escribir(campo, "artista");
    await waitFor(() => expect(opciones()).toHaveLength(20));
    for (let i = 0; i < 20; i++) fireEvent.keyDown(campo, { key: "ArrowDown" });
    expect(campo).toHaveAttribute("aria-activedescendant", opciones()[19].id);

    fireEvent.keyDown(campo, { key: "ArrowDown" }); // en la última: pide más
    await waitFor(() => expect(opciones()).toHaveLength(40));
    fireEvent.keyDown(campo, { key: "ArrowDown" });

    expect(campo).toHaveAttribute("aria-activedescendant", opciones()[20].id);
  });

  it("si una respuesta vieja llega tarde no pisa a la nueva", async () => {
    let soltarLenta!: () => void;
    const buscar = vi.fn<BuscarCanciones>((texto) =>
      texto === "lenta"
        ? new Promise((resolver) => {
            soltarLenta = () => resolver({ canciones: [cancion(1, "De la búsqueda lenta", "X")], hayMas: false });
          })
        : Promise.resolve({ canciones: [cancion(2, "De la búsqueda rápida", "Y")], hayMas: false }),
    );
    const { campo } = montar({ buscar });

    escribir(campo, "lenta");
    await waitFor(() => expect(buscar).toHaveBeenCalledWith("lenta", 1, expect.any(AbortSignal)));
    escribir(campo, "rapida");
    await screen.findByRole("option", { name: /rápida/ });
    soltarLenta();
    await new Promise((r) => setTimeout(r, 20));

    expect(opciones()).toHaveLength(1);
    expect(screen.queryByRole("option", { name: /lenta/ })).toBeNull();
  });

  it("cancela el pedido anterior cuando se escribe otra cosa y al desmontarse", async () => {
    const senales: AbortSignal[] = [];
    const buscar = vi.fn<BuscarCanciones>((_t, _p, senial) => {
      if (senial) senales.push(senial);
      return new Promise(() => {}); // nunca responde
    });
    const { campo } = montar({ buscar });

    escribir(campo, "uno");
    await waitFor(() => expect(senales).toHaveLength(1));
    escribir(campo, "dos");
    await waitFor(() => expect(senales).toHaveLength(2));
    expect(senales[0].aborted).toBe(true);

    cleanup();
    expect(senales[1].aborted).toBe(true);
  });

  it("mientras busca lo avisa, y si no hay nada que mostrar todavía no dice que no encontró", async () => {
    let responder!: () => void;
    const buscar = vi.fn<BuscarCanciones>(() => new Promise((r) => (responder = () => r({ canciones: [cancion(1, "Listo", "X")], hayMas: false }))));
    const { campo } = montar({ buscar });

    escribir(campo, "algo");

    expect(await screen.findByRole("status")).toHaveTextContent("Buscando");
    expect(screen.queryByText(/No encontramos/)).toBeNull();
    responder();
    await screen.findByRole("option");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("avisa cuando nada coincide", async () => {
    const { campo } = montar();

    escribir(campo, "zzzz");

    expect(await screen.findByText("No encontramos esa canción.")).toBeInTheDocument();
  });

  it("si la búsqueda falla lo dice, sin romper, y escribir de nuevo vuelve a intentar", async () => {
    const buscar = vi.fn<BuscarCanciones>().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue({ canciones: [cancion(1, "Ahora sí", "X")], hayMas: false });
    const { campo } = montar({ buscar });

    escribir(campo, "algo");
    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos buscar/);

    escribir(campo, "algo más");
    expect(await screen.findByRole("option", { name: /Ahora sí/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("BuscadorCanciones: elegir y enviar", () => {
  it("borrar lo escrito cierra la lista, y no vuelve a pedir nada", async () => {
    const { campo, buscar } = montar();
    escribir(campo, "candombe");
    await screen.findByRole("listbox");

    escribir(campo, "");

    expect(screen.queryByRole("listbox")).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("la lista se cierra cuando el campo pierde el foco, pero elegir una opción con el mouse sigue andando", async () => {
    const { campo } = montar();
    escribir(campo, "sin sa");
    await screen.findByRole("listbox");

    fireEvent.blur(campo);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(campo);
    const opcion = screen.getByRole("option", { name: /Sin saber/ });
    // Tocar una opción no le quita el foco al campo (mousedown se cancela): se elige antes de cerrar.
    expect(fireEvent.mouseDown(opcion)).toBe(false);
    fireEvent.click(opcion);

    expect(campo.value).toBe("Sin saber");
  });

  it("Escape cierra la lista sin borrar lo escrito, y un clic en el campo la vuelve a abrir", async () => {
    const { campo } = montar();
    escribir(campo, "no te va");
    await screen.findByRole("listbox");

    fireEvent.keyDown(campo, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(campo.value).toBe("no te va");

    fireEvent.click(campo);
    expect(opciones()).toHaveLength(2);
  });

  it("al elegir una opción completa el campo, habilita enviar y NO vuelve a buscar", async () => {
    const { campo, buscar } = montar();
    expect(enviar()).toBeDisabled();
    escribir(campo, "sin sa");
    await screen.findByRole("option", { name: /Sin saber/ });

    fireEvent.click(screen.getByRole("option", { name: /Sin saber/ }));
    await new Promise((r) => setTimeout(r, 20));

    expect(campo.value).toBe("Sin saber");
    expect(enviar()).toBeEnabled();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("no permite enviar mientras no se pueda (el audio no sonó) aunque haya una canción elegida", async () => {
    const { campo } = montar({ puedeEnviar: false });
    escribir(campo, "sin sa");
    fireEvent.click(await screen.findByRole("option", { name: /Sin saber/ }));

    expect(enviar()).toBeDisabled();
  });

  it("al enviar entrega la canción elegida completa y limpia el campo", async () => {
    const { campo, alEnviar } = montar();
    escribir(campo, "sin sa");
    fireEvent.click(await screen.findByRole("option", { name: /Sin saber/ }));

    fireEvent.click(enviar());

    expect(alEnviar).toHaveBeenCalledWith(CANCIONES[1]);
    expect(campo.value).toBe("");
    expect(enviar()).toBeDisabled();
  });

  it("editar el texto después de elegir invalida la elección", async () => {
    const { campo } = montar();
    escribir(campo, "sin sa");
    fireEvent.click(await screen.findByRole("option", { name: /Sin saber/ }));

    escribir(campo, "Sin sabe");

    expect(enviar()).toBeDisabled();
  });

  it("se maneja con el teclado: flechas para moverse y Enter para elegir", async () => {
    const { campo } = montar();
    escribir(campo, "no te va");
    await waitFor(() => expect(opciones()).toHaveLength(2));

    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    expect(campo).toHaveAttribute("aria-activedescendant", opciones()[1].id);
    fireEvent.keyDown(campo, { key: "Enter" });

    expect(campo.value).toBe("Sin saber");
  });

  it("al moverse con el teclado lleva la opción activa a la vista dentro de la lista", async () => {
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    const { campo } = montar();
    escribir(campo, "no te va");
    await waitFor(() => expect(opciones()).toHaveLength(2));

    fireEvent.keyDown(campo, { key: "ArrowDown" });

    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("mientras se envía bloquea el botón", async () => {
    const { campo } = montar({ enviando: true });
    escribir(campo, "sin sa");
    fireEvent.click(await screen.findByRole("option", { name: /Sin saber/ }));

    expect(enviar()).toBeDisabled();
  });
});
