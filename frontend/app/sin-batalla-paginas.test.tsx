import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function cargar(valor: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", valor);
  const paginas = await import("./lib/paginas");
  const seo = await import("./lib/seo");
  const ruta = await import("./[pagina]/page");
  return { paginas, seo, ruta };
}

describe("el modo batalla apagado: páginas y textos", () => {
  it("/batalla no existe: no está registrada ni se genera", async () => {
    const { paginas, ruta } = await cargar("");

    expect(paginas.paginaPorSlug("batalla")).toBeUndefined();
    expect((await ruta.generateStaticParams()).map((p: { pagina: string }) => p.pagina)).not.toContain("batalla");
  });

  it("no queda ningún texto del sitio que prometa el modo batalla", async () => {
    const { paginas, seo } = await cargar("");

    // Los términos y la privacidad sí lo mencionan aunque el modo esté apagado para el público: a las salas se entra con un
    // enlace (solo crearlas está restringido), y ahí ya se guardan datos de quien juega, así que tienen que decirlo.
    const promocionales = Object.entries(paginas.PAGINAS).filter(([slug]) => !["terminos", "privacidad"].includes(slug));
    const todo = JSON.stringify([promocionales, seo.DESCRIPCION]).toLowerCase();
    expect(todo).not.toContain("batalla");
  });

  it("con el interruptor prendido existe y la descripción vuelve a mencionarla", async () => {
    const { paginas, seo, ruta } = await cargar("1");

    expect(paginas.paginaPorSlug("batalla")?.tipo).toBe("proximamente");
    const pronto = await ruta.generateMetadata({ params: Promise.resolve({ pagina: "batalla" }) });
    expect(pronto.robots).toEqual({ index: false, follow: false }); // aunque se prenda, mientras diga "próximamente" no se indexa
    expect(seo.DESCRIPCION.toLowerCase()).toContain("batalla");
  });
});
