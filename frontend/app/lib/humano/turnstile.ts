const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render(contenedor: HTMLElement, opciones: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let cargando: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  cargando ??= new Promise<void>((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => {
      cargando = null; // se puede volver a intentar
      rechazar(new Error("No se pudo cargar la comprobación."));
    };
    document.head.appendChild(script);
  });
  return cargando;
}

/**
 * Corre el desafío de Cloudflare Turnstile y devuelve su token. El widget solo se ve si Cloudflare necesita que la
 * persona haga algo ("interaction-only"); si no, todo pasa sin que se note. Se saca de la pantalla al terminar.
 */
export async function resolverDesafio(claveDelSitio: string): Promise<string> {
  await cargarScript();
  return new Promise<string>((resolver, rechazar) => {
    const contenedor = document.createElement("div");
    contenedor.className = "comprobacion-humana";
    const texto = document.createElement("p");
    texto.className = "comprobacion-humana__texto";
    texto.textContent = "Un segundito: comprobamos que sos una persona.";
    const casilla = document.createElement("div");
    contenedor.append(texto, casilla);
    document.body.appendChild(contenedor);

    let id = "";
    const terminar = () => {
      if (id) window.turnstile?.remove(id);
      contenedor.remove();
    };
    id = window.turnstile!.render(casilla, {
      sitekey: claveDelSitio,
      appearance: "interaction-only",
      language: "es",
      // Casi siempre pasa sola y no se ve nada; solo si Cloudflare necesita un clic, se muestra el cartel.
      "before-interactive-callback": () => contenedor.classList.add("comprobacion-humana--visible"),
      "after-interactive-callback": () => contenedor.classList.remove("comprobacion-humana--visible"),
      callback: (token: string) => {
        terminar();
        resolver(token);
      },
      "error-callback": () => {
        terminar();
        rechazar(new Error("Falló la comprobación."));
      },
      "timeout-callback": () => {
        terminar();
        rechazar(new Error("La comprobación tardó demasiado."));
      },
    });
  });
}
