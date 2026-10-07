import { normalizarTexto } from "./logica";
import type { BuscarCanciones, CancionCatalogo } from "./tipos";

/** Un servidor de mentira para las pruebas: busca en `catalogo` como la API (todas las palabras, sin tildes) y devuelve de a páginas. */
export function buscarEn(catalogo: CancionCatalogo[], porPagina = 20): BuscarCanciones {
  return async (texto, pagina) => {
    const palabras = normalizarTexto(texto).split(/\s+/).filter(Boolean);
    const todas = catalogo.filter((c) => palabras.every((p) => normalizarTexto(`${c.title} ${c.artist} ${c.album}`).includes(p)));
    const desde = (pagina - 1) * porPagina;
    return { canciones: todas.slice(desde, desde + porPagina), hayMas: todas.length > desde + porPagina };
  };
}
