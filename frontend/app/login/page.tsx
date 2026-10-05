import type { Metadata } from "next";
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

  // Pantalla propia, sin la barra ni el pie del sitio: el cuadro de la escena (con el logo y el camino de vuelta) está en PantallaLogin.
  return (
    <main className="acceso">
      <PantallaLogin />
    </main>
  );
}
