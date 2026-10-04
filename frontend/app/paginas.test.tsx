import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Pagina, { generateMetadata, generateStaticParams } from "./[pagina]/page";
import { PAGINAS, SLUGS, paginaPorSlug } from "./lib/paginas";
import { SITIO_URL } from "./lib/seo";
import sitemap from "./sitemap";
import { PaginaDeContenido } from "./ui/PaginaDeContenido";

afterEach(cleanup);

const DE_TEXTO = ["como-funciona", "acerca", "contacto", "sugerencias", "terminos", "privacidad"];
const PROXIMAMENTE = ["batalla", "archivo", "ranking", "artistas", "epocas", "generos", "login"];

describe("registro de páginas", () => {
  it("cubre todos los enlaces del sitio que antes daban 404", () => {
    expect([...SLUGS].sort()).toEqual([...DE_TEXTO, ...PROXIMAMENTE].sort());
  });

  it("cada página tiene título y descripción para los buscadores", () => {
    for (const pagina of Object.values(PAGINAS)) {
      expect(pagina.titulo.length).toBeGreaterThan(2);
      expect(pagina.descripcion.length).toBeGreaterThan(20);
    }
  });

  it("las páginas de texto tienen varias secciones y ningún texto de relleno", () => {
    for (const slug of DE_TEXTO) {
      const pagina = paginaPorSlug(slug);
      expect(pagina?.tipo).toBe("texto");
      if (pagina?.tipo !== "texto") continue;
      expect(pagina.secciones.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(pagina)).not.toMatch(/lorem|\bTODO\b|XXX/);
    }
  });

  it("los textos legales se presentan como versión preliminar, con fecha", () => {
    for (const slug of ["terminos", "privacidad"]) {
      const pagina = paginaPorSlug(slug);
      expect(pagina?.tipo === "texto" && pagina.preliminar).toBe(true);
    }
  });

  it("devuelve undefined para un nombre que no existe", () => {
    expect(paginaPorSlug("no-existe")).toBeUndefined();
  });

  it("la política de privacidad dice qué datos se guardan y dónde", () => {
    const texto = JSON.stringify(paginaPorSlug("privacidad"));

    expect(texto).toMatch(/identificador/i);
    expect(texto).toMatch(/navegador/i);
    expect(texto).toMatch(/18\.331/);
  });

  it("la política de privacidad avisa que se miden las visitas, sin cookies", () => {
    const texto = JSON.stringify(paginaPorSlug("privacidad"));

    expect(texto).toMatch(/Vercel Web Analytics/);
    expect(texto).toMatch(/sin cookies/i);
    expect(texto).toMatch(/Search Console/);
  });

  it("cómo funciona explica las reglas principales", () => {
    const texto = JSON.stringify(paginaPorSlug("como-funciona"));

    for (const clave of [/seis intentos/i, /pista/i, /medianoche/i, /color/i]) expect(texto).toMatch(clave);
  });
});

describe("PaginaDeContenido", () => {
  it("una página de texto muestra el título, la bajada y una sección por cada tema", () => {
    const pagina = paginaPorSlug("como-funciona")!;
    render(<PaginaDeContenido pagina={pagina} />);

    expect(screen.getByRole("heading", { level: 1, name: pagina.titulo })).toBeInTheDocument();
    if (pagina.tipo !== "texto") throw new Error("se esperaba una página de texto");
    for (const seccion of pagina.secciones) expect(screen.getByRole("heading", { level: 2, name: seccion.titulo })).toBeInTheDocument();
  });

  it("una página que todavía no existe dice que llega pronto y ofrece volver o jugar", () => {
    render(<PaginaDeContenido pagina={paginaPorSlug("batalla")!} />);

    const principal = within(screen.getByRole("main"));
    expect(principal.getByText("PRÓXIMAMENTE")).toBeInTheDocument();
    expect(principal.getByRole("link", { name: /Volver al inicio/ })).toHaveAttribute("href", "/");
    expect(principal.getByRole("link", { name: /Jugar el diario/ })).toHaveAttribute("href", "/jugar");
  });

  it("el inicio de sesión pendiente manda al historial local mientras tanto", () => {
    render(<PaginaDeContenido pagina={paginaPorSlug("login")!} />);

    expect(within(screen.getByRole("main")).getByRole("link", { name: /Ver mi historial/ })).toHaveAttribute("href", "/historial");
  });

  it("los textos legales llevan el aviso de versión preliminar", () => {
    render(<PaginaDeContenido pagina={paginaPorSlug("terminos")!} />);

    expect(screen.getByText(/versión preliminar/i)).toBeInTheDocument();
  });

  it("muestra el correo de contacto cuando está configurado", () => {
    render(<PaginaDeContenido pagina={paginaPorSlug("contacto")!} correo="hola@ejemplo.uy" />);

    expect(screen.getByRole("link", { name: "hola@ejemplo.uy" })).toHaveAttribute("href", "mailto:hola@ejemplo.uy");
  });

  it("sin correo configurado avisa que se está habilitando, en vez de mostrar un enlace roto", () => {
    render(<PaginaDeContenido pagina={paginaPorSlug("contacto")!} />);

    expect(screen.queryByRole("link", { name: /@/ })).toBeNull();
    expect(screen.getByText(/estamos habilitando el correo/i)).toBeInTheDocument();
  });

  it("deja marcada la página actual en la barra de navegación", () => {
    render(<PaginaDeContenido pagina={paginaPorSlug("acerca")!} />);

    const principal = screen.getByRole("navigation", { name: "Principal" });
    expect(within(principal).getByRole("link", { name: "Acerca de" })).toHaveAttribute("aria-current", "page");
  });
});

describe("ruta [pagina]", () => {
  it("genera una página estática por cada nombre del registro", async () => {
    expect((await generateStaticParams()).map((p) => p.pagina).sort()).toEqual([...SLUGS].sort());
  });

  it("arma la página de un nombre válido", async () => {
    render(await Pagina({ params: Promise.resolve({ pagina: "acerca" }) }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(paginaPorSlug("acerca")!.titulo);
  });

  it("un nombre que no existe da error 404", async () => {
    await expect(Pagina({ params: Promise.resolve({ pagina: "no-existe" }) })).rejects.toThrow();
  });

  it("las páginas de texto se pueden indexar y las que todavía no existen, no", async () => {
    const texto = await generateMetadata({ params: Promise.resolve({ pagina: "como-funciona" }) });
    const pronto = await generateMetadata({ params: Promise.resolve({ pagina: "batalla" }) });

    expect(texto.title).toBe("Cómo funciona");
    expect(texto.robots).toBeUndefined();
    expect(pronto.robots).toEqual({ index: false, follow: false });
  });
});

describe("sitemap", () => {
  it("lista la portada, el juego y las páginas con contenido, y deja afuera las que todavía no existen", () => {
    const urls = sitemap().map((e) => e.url);

    expect(urls).toEqual(expect.arrayContaining([`${SITIO_URL}/`, `${SITIO_URL}/jugar`, ...DE_TEXTO.map((s) => `${SITIO_URL}/${s}`)]));
    for (const slug of PROXIMAMENTE) expect(urls).not.toContain(`${SITIO_URL}/${slug}`);
    expect(urls).not.toContain(`${SITIO_URL}/historial`);
  });
});
