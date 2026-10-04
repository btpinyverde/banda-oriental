import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Pagina, { generateMetadata, generateStaticParams } from "./[pagina]/page";
import { PAGINAS, SLUGS, paginaPorSlug } from "./lib/paginas";
import { SITIO_URL } from "./lib/seo";
import sitemap from "./sitemap";
import { PaginaDeContenido } from "./ui/PaginaDeContenido";

afterEach(cleanup);

const DE_TEXTO = ["como-funciona", "acerca", "contacto", "sugerencias", "terminos", "privacidad"];
const PROXIMAMENTE = ["batalla", "archivo", "artistas", "epocas", "generos"];

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

  it("la política de privacidad explica las cuentas: qué se guarda, el proveedor de correo y cómo borrarla", () => {
    const texto = JSON.stringify(paginaPorSlug("privacidad"));

    expect(texto).toMatch(/correo y tu contraseña/);
    expect(texto).toMatch(/no podemos leerla/);
    expect(texto).toMatch(/Resend/);
    expect(texto).toMatch(/Borrar mi cuenta/);
    expect(texto).toMatch(/clave de sesión/);
    expect(texto).not.toMatch(/Cuando agreguemos funciones, como las cuentas/);
  });

  it("los términos dicen que el juego es solo para personas: nada de bots, scripts ni agentes de IA", () => {
    const texto = JSON.stringify(paginaPorSlug("terminos"));

    expect(texto).toMatch(/solo para personas/);
    expect(texto).toMatch(/agentes de IA/);
    expect(texto).toMatch(/rastreadores/);
  });

  it("la política de privacidad explica la comprobación humana y para qué se guarda la dirección IP", () => {
    const texto = JSON.stringify(paginaPorSlug("privacidad"));

    expect(texto).toMatch(/Cloudflare Turnstile/);
    expect(texto).toMatch(/programas automáticos/);
    expect(texto).toMatch(/dirección IP.*seguridad|seguridad.*dirección IP/);
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

describe("textos legales: lo que el servidor guarda de verdad", () => {
  const privacidad = () => JSON.stringify(paginaPorSlug("privacidad"));
  const terminos = () => JSON.stringify(paginaPorSlug("terminos"));
  const comoFunciona = () => JSON.stringify(paginaPorSlug("como-funciona"));

  it("la privacidad ya no dice que las estadísticas se quedan solo en el dispositivo", () => {
    expect(privacidad()).not.toMatch(/no salen de tu dispositivo/i);
  });

  it("la privacidad dice que el servidor guarda partidas, estadísticas y racha, y que sin cuenta se asocian al identificador anónimo", () => {
    expect(privacidad()).toMatch(/estadísticas/i);
    expect(privacidad()).toMatch(/racha/i);
    expect(privacidad()).toMatch(/identificador anónimo/i);
  });

  it("la privacidad avisa que sin cuenta, tras siete días sin jugar, el historial se borra", () => {
    expect(privacidad()).toMatch(/siete días/i);
    expect(privacidad()).not.toMatch(/no se borran/i);
  });

  it("la privacidad dice que el nombre del ranking es público y se conserva al crear la cuenta", () => {
    expect(privacidad()).toMatch(/nombre público/i);
    expect(privacidad()).toMatch(/públic[oa]/i);
  });

  it("la privacidad aclara qué pasa con las estadísticas y el nombre al borrar la cuenta", () => {
    expect(privacidad()).toMatch(/tus estadísticas/i);
  });

  it("los términos explican el nombre del ranking (único, se elige una vez) y ya no dicen que el ranking se está armando", () => {
    expect(terminos() + comoFunciona()).not.toMatch(/estamos terminando de armar/i);
    expect(comoFunciona()).toMatch(/una sola vez/i);
    expect(comoFunciona()).toMatch(/semana/i);
  });
});

describe("sitemap", () => {
  it("lista la portada, el juego y las páginas con contenido, y deja afuera las que todavía no existen", () => {
    const urls = sitemap().map((e) => e.url);

    expect(urls).toEqual(expect.arrayContaining([`${SITIO_URL}/`, `${SITIO_URL}/jugar`, ...DE_TEXTO.map((s) => `${SITIO_URL}/${s}`)]));
    for (const slug of PROXIMAMENTE) expect(urls).not.toContain(`${SITIO_URL}/${slug}`);
    expect(urls).not.toContain(`${SITIO_URL}/historial`);
  });

  it("lista el ranking, que ahora tiene datos reales y cambia todos los días", () => {
    const entrada = sitemap().find((e) => e.url === `${SITIO_URL}/ranking`);

    expect(entrada).toBeDefined();
    expect(entrada?.changeFrequency).toBe("daily");
  });
});
