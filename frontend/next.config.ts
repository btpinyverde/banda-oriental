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
  async rewrites() {
    if (!destinoApi) return [];
    return [
      { source: "/api/:path*/", destination: `${destinoApi}/api/:path*/` },
      { source: "/api/:path*", destination: `${destinoApi}/api/:path*` },
    ];
  },
};

export default nextConfig;
