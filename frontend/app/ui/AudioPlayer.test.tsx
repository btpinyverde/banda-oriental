// frontend/app/ui/AudioPlayer.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

describe("AudioPlayer", () => {
  test("does not report ready just from clicking play", () => {
    const onReady = vi.fn();
    render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);

    fireEvent.click(screen.getByRole("button", { name: /reproducir audio/i }));

    expect(onReady).not.toHaveBeenCalledWith(true);
  });

  test("reports ready only after the native playing event fires", () => {
    const onReady = vi.fn();
    const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);

    fireEvent.playing(container.querySelector("audio")!);

    expect(onReady).toHaveBeenLastCalledWith(true);
  });

  test("keeps an already heard attempt ready when paused", () => {
    const onReady = vi.fn();
    const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);
    const audio = container.querySelector("audio")!;

    fireEvent.playing(audio);
    fireEvent.pause(audio);

    expect(onReady).toHaveBeenLastCalledWith(true);
  });

  test("shows a retry affordance and keeps the guess gated when playback errors", () => {
    const onReady = vi.fn();
    const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);

    fireEvent.error(container.querySelector("audio")!);

    expect(screen.getByRole("button", { name: /reintentar audio/i })).toBeInTheDocument();
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  test("resets the ready flag when the src changes to a new attempt's stem", () => {
    const onReady = vi.fn();
    const { container, rerender } = render(
      <AudioPlayer src="/stem-1.mp3" unlockedCount={1} onReady={onReady} />
    );
    fireEvent.playing(container.querySelector("audio")!);
    expect(onReady).toHaveBeenLastCalledWith(true);

    rerender(<AudioPlayer src="/stem-2.mp3" unlockedCount={2} onReady={onReady} />);

    expect(onReady).toHaveBeenLastCalledWith(false);
  });
});

test("blocks submission during buffering and after a failed stream", () => {
  const onReady = vi.fn();
  const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);
  const audio = container.querySelector("audio")!;
  fireEvent.playing(audio);
  fireEvent.waiting(audio);
  expect(onReady).toHaveBeenLastCalledWith(false);
  fireEvent.error(audio);
  fireEvent.pause(audio);
  expect(onReady).toHaveBeenLastCalledWith(false);
});
