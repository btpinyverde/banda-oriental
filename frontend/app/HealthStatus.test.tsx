import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthStatus } from "./HealthStatus";

afterEach(() => {
  // Without `test.globals: true` in vitest.config.ts, @testing-library/react
  // can't auto-detect afterEach to clean up the DOM between tests — without
  // this, elements from earlier tests stay mounted and getByText queries
  // can match stale nodes from a previous test instead of the current one.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

  it("shows an error when the backend responds with a non-ok status (e.g. 503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({ status: "error", db: "unreachable" }),
        })
      ) as unknown as typeof fetch
    );
    render(<HealthStatus />);
    await waitFor(() =>
      expect(
        screen.getByText("no se pudo contactar al servidor")
      ).toBeInTheDocument()
    );
  });

  it("shows an error when the backend responds 200 with status error in the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "error", db: "unreachable" }),
        })
      ) as unknown as typeof fetch
    );
    render(<HealthStatus />);
    await waitFor(() =>
      expect(
        screen.getByText("no se pudo contactar al servidor")
      ).toBeInTheDocument()
    );
  });

  it("fetches the health endpoint at NEXT_PUBLIC_API_BASE_URL + /api/health/", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://example-backend.test");
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "ok", db: "ok" }),
      })
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { HealthStatus: FreshHealthStatus } = await import("./HealthStatus");
    render(<FreshHealthStatus />);

    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example-backend.test/api/health/"
    );
  });
});
