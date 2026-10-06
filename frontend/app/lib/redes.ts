/**
 * Las redes sociales del proyecto. Cada una aparece solo si su dirección está configurada (variables de Vercel
 * NEXT_PUBLIC_INSTAGRAM_URL y NEXT_PUBLIC_TIKTOK_URL): un botón que no lleva a ningún lado se ve mal y no sirve.
 * Solo se aceptan direcciones https. Se leen con el nombre completo (no con una variable) para que Next las incluya al compilar.
 */
export interface Red {
  etiqueta: string;
  href: string;
  /** Nombre del ícono en /assets (Simple Icons, CC0). */
  icono: string;
}

const esHttps = (valor: string | undefined): valor is string => !!valor && valor.trim().startsWith("https://");

export function redesConfiguradas(): Red[] {
  const instagram = process.env.NEXT_PUBLIC_INSTAGRAM_URL;
  const tiktok = process.env.NEXT_PUBLIC_TIKTOK_URL;
  return [
    ...(esHttps(instagram) ? [{ etiqueta: "Instagram", href: instagram.trim(), icono: "social-instagram" }] : []),
    ...(esHttps(tiktok) ? [{ etiqueta: "TikTok", href: tiktok.trim(), icono: "social-tiktok" }] : []),
  ];
}
