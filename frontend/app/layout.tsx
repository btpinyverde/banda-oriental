import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { COLOR_FONDO, DESCRIPCION, IDIOMA, NOMBRE, SITIO_URL, TITULO } from "./lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  title: { default: TITULO, template: `%s | ${NOMBRE}` },
  description: DESCRIPCION,
  applicationName: NOMBRE,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_UY",
    siteName: NOMBRE,
    url: "/",
    title: TITULO,
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION,
  },
  robots: { index: true, follow: true },
  // La imagen para compartir sale de app/opengraph-image.tsx y los íconos de app/icon.svg,
  // app/apple-icon.png y app/favicon.ico: Next los agrega solo.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: COLOR_FONDO,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={IDIOMA}>
      <body>{children}</body>
    </html>
  );
}
