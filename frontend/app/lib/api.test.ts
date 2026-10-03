// frontend/app/lib/api.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, getDailyState, listSongs, submitGuess } from "./api";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDailyState", () => {
  test("returns the parsed state on success", async () => {
    mockFetchOnce(200, { finished: false, day: "2026-10-02" });

    const state = await getDailyState("device-1");

    expect(state).toEqual({ finished: false, day: "2026-10-02" });
  });

  test("returns null when no song is published today", async () => {
    mockFetchOnce(404, { detail: "No hay canción publicada para hoy." });

    expect(await getDailyState("device-1")).toBeNull();
  });

  test("throws ApiError with the backend's message on other failures", async () => {
    mockFetchOnce(400, { detail: "El header X-Device-Id es requerido." });

    await expect(getDailyState("")).rejects.toMatchObject({
      message: "El header X-Device-Id es requerido.",
      status: 400,
    });
  });

  test("sends the device id header", async () => {
    mockFetchOnce(200, { finished: false });

    await getDailyState("device-abc");

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers["X-Device-Id"]).toBe("device-abc");
  });
});

describe("submitGuess", () => {
  test("posts the attempt number and song id as JSON", async () => {
    mockFetchOnce(200, {
      is_correct: true,
      attempt_number: 1,
      feedback: { year: "exact", genre: "same", artist: "same", album: "same" },
      finished: true,
      attempts_remaining: 5,
    });

    await submitGuess("device-1", 1, 42);

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/daily/guess/");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ attempt_number: 1, song_id: 42 });
  });

  test("throws ApiError on a rejected guess", async () => {
    mockFetchOnce(400, { detail: "Ya jugaste hoy." });

    await expect(submitGuess("device-1", 1, 42)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listSongs", () => {
  test("unwraps the songs array", async () => {
    mockFetchOnce(200, { songs: [{ id: 1, title: "Zafar", artist: "No Te Va Gustar" }] });

    const songs = await listSongs();

    expect(songs).toEqual([{ id: 1, title: "Zafar", artist: "No Te Va Gustar" }]);
  });
});
