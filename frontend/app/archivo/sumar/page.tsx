import type { Metadata } from "next";
import { FormularioDeReporte } from "../FormularioDeReporte";
import { Marco } from "../Marco";
import "../archivo-explorador.css";

export const metadata: Metadata = {
  title: "Sumá tu música",
  description: "Si tu banda o tu proyecto no está en el archivo de Banda Oriental, dejanos tus datos y la sumamos.",
  alternates: { canonical: "/archivo/sumar" },
};

export default async function PaginaSumar() {
  return (
    <Marco>
      <h1>Sumá tu música</h1>
      <p className="archivo-musical__bajada">
        ¿Tu banda o tu proyecto no está en el archivo? Dejanos el nombre y cómo encontrarte (Spotify, YouTube, Bandcamp…) y lo revisamos para sumarlo.
      </p>
      <FormularioDeReporte tipo="alta" />
    </Marco>
  );
}
