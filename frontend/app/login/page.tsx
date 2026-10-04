import type { Metadata } from "next";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { PantallaLogin } from "./PantallaLogin";
import "../cuenta/cuenta.css";

export const metadata: Metadata = {
  title: "Entrar o crear cuenta",
  description: "Entrá o creá tu cuenta de Banda Oriental para guardar tu historial en cualquier dispositivo.",
  // Es un formulario: no aporta nada en el buscador.
  robots: { index: false, follow: false },
};

export default function PaginaLogin() {
  return (
    <>
      <Navbar />
      <main className="cuenta">
        <header className="cuenta__cabecera">
          <h1>Tu cuenta</h1>
          <p className="cuenta__bajada">
            Con una cuenta tu historial y tus estadísticas te siguen a cualquier dispositivo. Jugar no la necesita.
          </p>
        </header>
        <PantallaLogin />
      </main>
      <Footer variante="compacto" />
    </>
  );
}
