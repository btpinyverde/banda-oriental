// frontend/app/lib/device-id.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("getDeviceId", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  test("creates and persists a UUID on first call", async () => {
    const { getDeviceId } = await import("./device-id");
    const id = getDeviceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(window.localStorage.getItem("banda-oriental:device-id")).toBe(id);
  });

  test("returns the same id on a later call", async () => {
    const { getDeviceId } = await import("./device-id");
    const first = getDeviceId();
    const second = getDeviceId();

    expect(second).toBe(first);
  });

  test("reuses the id already stored from a previous visit", async () => {
    window.localStorage.setItem("banda-oriental:device-id", "11111111-1111-1111-1111-111111111111");
    const { getDeviceId } = await import("./device-id");

    expect(getDeviceId()).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("falls back to a stable in-memory id when localStorage throws", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const { getDeviceId } = await import("./device-id");

    const first = getDeviceId();
    const second = getDeviceId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
    getItemSpy.mockRestore();
  });
});

test("repairs a corrupted persisted identity", async () => {
  vi.resetModules();
  localStorage.setItem("banda-oriental:device-id", "invalid");
  const { getDeviceId } = await import("./device-id");
  expect(getDeviceId()).toMatch(/^[0-9a-f-]{36}$/);
});
