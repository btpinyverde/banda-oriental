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
    const { paginas, ruta } = await cargar("0");

    expect(paginas.paginaPorSlug("batalla")).toBeUndefined();
    expect((await ruta.generateStaticParams()).map((p: { pagina: string }) => p.pagina)).not.toContain("batalla");
  });

  it("no queda ningún texto del sitio que prometa el modo batalla", async () => {
    const { paginas, seo } = await cargar("0");

    const todo = JSON.stringify([Object.values(paginas.PAGINAS), seo.DESCRIPCION]).toLowerCase();
    expect(todo).not.toContain("batalla");
  });

  it("con el interruptor prendido no hay una página de texto de /batalla (la real es la pantalla de crear) y la descripción la menciona", async () => {
    const { paginas, seo, ruta } = await cargar("1");

    // Antes había una página "llega pronto"; ahora /batalla es la pantalla de crear la sala (app/batalla), no una página de texto.
    expect(paginas.paginaPorSlug("batalla")).toBeUndefined();
    expect((await ruta.generateStaticParams()).map((p: { pagina: string }) => p.pagina)).not.toContain("batalla");
    expect(JSON.stringify(Object.values(paginas.PAGINAS)).toLowerCase()).not.toContain("llega pronto");
    expect(seo.DESCRIPCION.toLowerCase()).toContain("batalla");
  });
});
