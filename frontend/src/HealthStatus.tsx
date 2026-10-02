import { useEffect, useState } from "react";

type HealthState = "loading" | "ok" | "error";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export function HealthStatus() {
  const [state, setState] = useState<HealthState>("loading");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health/`)
      .then((response) => {
        if (!response.ok) throw new Error("unhealthy");
        return response.json();
      })
      .then((data: { status: string }) => {
        setState(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") return <p>cargando...</p>;
  if (state === "error") return <p>no se pudo contactar al servidor</p>;
  return <p>ok</p>;
}
