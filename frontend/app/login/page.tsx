import type { Metadata } from "next";
import Link from "next/link";
import { cuentasActivas } from "../lib/cuenta/activas";
import { PAGINA_CUENTAS_PROXIMAMENTE } from "../lib/paginas";
import { PaginaDeContenido } from "../ui/PaginaDeContenido";
import { PantallaLogin } from "./PantallaLogin";
import "../cuenta/acceso.css";

export const metadata: Metadata = {
  title: "Entrar o crear cuenta",
  description: "Entrá o creá tu cuenta de Banda Oriental para guardar tu historial en cualquier dispositivo.",
  // Es un formulario: no aporta nada en el buscador.
  robots: { index: false, follow: false },
};

export default function PaginaLogin() {
  if (!cuentasActivas()) return <PaginaDeContenido pagina={PAGINA_CUENTAS_PROXIMAMENTE} />;

  // Pantalla propia, sin la barra ni el pie del sitio: solo el logo y el camino de vuelta.
  return (
    <main className="acceso">
      <header className="acceso__barra">
        <Link href="/" className="acceso__logo" aria-label="Banda Oriental, inicio">
          <img src="/assets/brand-wordmark.svg" alt="Banda Oriental" width={150} height={80} />
        </Link>
        <Link href="/" className="acceso__volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Volver al inicio
        </Link>
      </header>
      <div className="acceso__escenario">
        <PantallaLogin />
      </div>
    </main>
  );
}
