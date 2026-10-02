import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthStatus } from "./HealthStatus";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HealthStatus", () => {
  it("shows loading state first", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) // never resolves
    );
    render(<HealthStatus />);
    expect(screen.getByText("cargando...")).toBeInTheDocument();
  });

  it("shows ok when the backend responds healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", db: "ok" }),
        })
      ) as unknown as typeof fetch
    );
    render(<HealthStatus />);
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
  });

  it("shows an error when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network error")))
    );
    render(<HealthStatus />);
    await waitFor(() =>
      expect(
        screen.getByText("no se pudo contactar al servidor")
      ).toBeInTheDocument()
    );
  });
});
