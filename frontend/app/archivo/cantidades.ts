import { listarArtistas, listarCanciones, listarDiscos } from "../lib/archivo-musical";

/** Cuántas canciones, artistas y discos tiene el archivo (para las pestañas y la bajada). `null` donde la API no respondió: nunca un cero inventado. */
export async function cantidadesDelArchivo() {
  const [canciones, artistas, discos] = await Promise.all([listarCanciones({ porPagina: 1 }), listarArtistas({ porPagina: 1 }), listarDiscos({ porPagina: 1 })]);
  return { canciones: canciones?.count ?? null, artistas: artistas?.count ?? null, discos: discos?.count ?? null };
}
