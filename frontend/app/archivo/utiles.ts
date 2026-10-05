/** Un valor de la dirección (`?pagina=2`): el primero si vienen varios. */
const primero = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);

export type Parametros = Promise<Record<string, string | string[] | undefined>>;

/** Un número entero positivo de la dirección; `undefined` si no lo es (nunca un error: una dirección rara es la lista normal). */
export function enteroDe(valor: string | string[] | undefined): number | undefined {
  const texto = primero(valor);
  return texto && /^[1-9]\d{0,9}$/.test(texto) ? Number(texto) : undefined;
}

/** Un texto corto de la dirección, sin espacios de más; `undefined` si está vacío. */
export function textoDe(valor: string | string[] | undefined, maximo = 100): string | undefined {
  const texto = (primero(valor) ?? "").replace(/\s+/g, " ").trim().slice(0, maximo);
  return texto || undefined;
}

/** Una sola letra (con o sin tilde) de la dirección, en mayúscula; `undefined` si es otra cosa. */
export function letraDe(valor: string | string[] | undefined): string | undefined {
  const texto = primero(valor);
  return texto && /^\p{L}$/u.test(texto) ? texto.toLocaleUpperCase("es") : undefined;
}

/** Los filtros puestos, como parámetros de dirección (sin los vacíos), para conservarlos al paginar. */
export function sinVacios(parametros: Record<string, string | number | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(parametros).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
}

export const cantidad = (n: number) => new Intl.NumberFormat("es-UY").format(n);
