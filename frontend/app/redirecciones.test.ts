import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("redirecciones del sitio", () => {
  it("los días pasados que antes vivían en /archivo/<fecha> (ya indexados) pasan a /anteriores/<fecha> de forma permanente", async () => {
    const reglas = await nextConfig.redirects!();

    const regla = reglas.find((r) => r.source.startsWith("/archivo/:fecha"));
    expect(regla).toMatchObject({ destination: "/anteriores/:fecha", permanent: true });
    // Solo fechas: lo que cuelgue de /archivo que no sea una fecha es del archivo de música y no se mueve.
    expect(regla!.source).toContain("\\d{4}-\\d{2}-\\d{2}");
  });
});
