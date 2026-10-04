import { NextResponse, type NextRequest } from "next/server";
import { esAgenteDeIA } from "./app/lib/seguridad/agentes-ia";

/**
 * El sitio es para personas. Los agentes y rastreadores de IA que se identifican pueden leer la portada y nada más:
 * en cualquier otra página reciben un 403. Los buscadores comunes (Google, Bing) no se tocan.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/" && esAgenteDeIA(request.headers.get("user-agent"))) {
    return new NextResponse("Este sitio es solo para personas.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos lo que la portada necesita para verse (archivos estáticos, imágenes, íconos) y robots/sitemap.
  matcher: [
    "/((?!_next/static|_next/image|assets/|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|twitter-image).*)",
  ],
};
