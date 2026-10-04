/**
 * Vercel Web Analytics: mide visitas sin cookies ni identificadores personales. El script lo sirve Vercel
 * en esta ruta solo en producción y con Analytics activado en el proyecto; en desarrollo no existe.
 */
export function Analitica({ activa }: { activa: boolean }) {
  if (!activa) return null;
  return <script defer src="/_vercel/insights/script.js" />;
}
