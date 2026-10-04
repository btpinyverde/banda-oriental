import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiaActual } from "./useDiaActual";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDiaActual", () => {
  it("devuelve el día de hoy en Montevideo", () => {
    vi.setSystemTime(new Date("2026-10-03T15:00:00Z"));

    const { result } = renderHook(() => useDiaActual());

    expect(result.current).toBe("2026-10-03");
  });

  it("pasa al día siguiente solo, cuando llega la medianoche de Montevideo", () => {
    vi.setSystemTime(new Date("2026-10-04T02:59:30Z")); // 23:59:30 del 3 de octubre en Montevideo
    const { result } = renderHook(() => useDiaActual());
    expect(result.current).toBe("2026-10-03");

    act(() => void vi.advanceTimersByTime(60_000));

    expect(result.current).toBe("2026-10-04");
  });

  it("no cambia de valor mientras sigue el mismo día", () => {
    vi.setSystemTime(new Date("2026-10-03T15:00:00Z"));
    const { result } = renderHook(() => useDiaActual());

    act(() => void vi.advanceTimersByTime(120_000));

    expect(result.current).toBe("2026-10-03");
  });

  it("deja de revisar al desmontarse", () => {
    vi.setSystemTime(new Date("2026-10-03T15:00:00Z"));
    const { unmount } = renderHook(() => useDiaActual());

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
