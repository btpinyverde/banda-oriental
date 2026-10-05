import type { NextConfig } from "next";

/**
 * Solo para desarrollo: con API_PROXY_TARGET (ej. https://banda-oriental-backend.onrender.com) Next reenvía
 * /api/* a esa API, así el navegador no hace pedidos de otro origen y no hace falta permitir `localhost` en el
 * CORS del backend. Sin la variable no cambia nada. La URL del juego en ese caso: NEXT_PUBLIC_API_BASE_URL vacío.
 */
const destinoApi = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Django exige la barra final (/api/songs/): sin esto Next la quita con una redirección y se rompe.
  ...(destinoApi && { skipTrailingSlashRedirect: true }),
  async redirects() {
    return [
      // Los días pasados del juego vivían en /archivo/<fecha> (ya los conoce Google); el archivo ahora es el de música.
      { source: "/archivo/:fecha(\\d{4}-\\d{2}-\\d{2})", destination: "/anteriores/:fecha", permanent: true },
      // Las páginas de explorar el catálogo (artistas, épocas, géneros) ahora son parte del archivo de música.
      { source: "/artistas", destination: "/archivo/artistas", permanent: true },
      { source: "/epocas", destination: "/archivo/discos?orden=year", permanent: true },
      { source: "/generos", destination: "/archivo/discos", permanent: true },
    ];
  },
  async rewrites() {
    if (!destinoApi) return [];
    return [
      { source: "/api/:path*/", destination: `${destinoApi}/api/:path*/` },
      { source: "/api/:path*", destination: `${destinoApi}/api/:path*` },
    ];
  },
};

export default nextConfig;
