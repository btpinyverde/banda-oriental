// frontend/app/jugar/GameScreen.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GameScreen } from "./GameScreen";
import * as api from "../lib/api";
import { getDeviceId } from "../lib/device-id";

vi.mock("../lib/device-id", () => ({ getDeviceId: vi.fn(() => "device-1") }));
vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof api>("../lib/api");
  return { ...actual, getDailyState: vi.fn(), listSongs: vi.fn(), submitGuess: vi.fn() };
});

const SONGS = [{ id: 1, title: "Zafar", artist: "No Te Va Gustar" }];

const IN_PROGRESS_STATE = {
  finished: false as const,
  day: "2026-10-02",
  attempt_number: 1,
  attempts_remaining: 6,
  unlocked_stems: [{ stem_type: "drums" as const, unlock_order: 1, url: "/stem-1.mp3" }],
  feedback_history: [],
};

beforeEach(() => {
  vi.mocked(getDeviceId).mockReturnValue("device-1");
  vi.mocked(api.listSongs).mockResolvedValue(SONGS);
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

describe("GameScreen", () => {
  test("shows a friendly message when there is no published song today", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue(null);

    render(<GameScreen />);

    expect(await screen.findByText(/todavía no hay canción publicada/i)).toBeInTheDocument();
  });

  test("renders the finished state directly without showing the guess form", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue({
      finished: true,
      day: "2026-10-02",
      won: true,
      score_submitted: false,
      song: { title: "Zafar", artist: "No Te Va Gustar", album: "La Teoría del Desorden" },
    });

    render(<GameScreen />);

    expect(await screen.findByText(/la adivinaste/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("shows a retryable error when the daily state request fails", async () => {
    vi.mocked(api.getDailyState).mockRejectedValue(new api.ApiError("Error del servidor", 500));

    render(<GameScreen />);

    expect(await screen.findByText("Error del servidor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  test("keeps the submit button disabled until the audio has actually started playing", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue(IN_PROGRESS_STATE);

    render(<GameScreen />);
    await screen.findByRole("combobox");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(await screen.findByText("Zafar"));

    expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
  });

  test("submits the selected song once audio is playing and shows the finished result", async () => {
    vi.mocked(api.getDailyState)
      .mockResolvedValueOnce(IN_PROGRESS_STATE)
      .mockResolvedValueOnce({
        finished: true,
        day: "2026-10-02",
        won: true,
        score_submitted: false,
        song: { title: "Zafar", artist: "No Te Va Gustar", album: "La Teoría del Desorden" },
      });
    vi.mocked(api.submitGuess).mockResolvedValue({
      is_correct: true,
      attempt_number: 1,
      feedback: { year: "exact", genre: "same", artist: "same", album: "same" },
      finished: true,
      attempts_remaining: 5,
    });

    const { container } = render(<GameScreen />);
    await screen.findByRole("combobox");
    fireEvent.playing(container.querySelector("audio")!);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(await screen.findByText("Zafar"));
    fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));

    expect(await screen.findByText(/la adivinaste/i)).toBeInTheDocument();
    expect(api.submitGuess).toHaveBeenCalledWith("device-1", 1, 1);
  });

  test("shows an error and keeps the attempt retryable when submitting fails", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue(IN_PROGRESS_STATE);
    vi.mocked(api.submitGuess).mockRejectedValue(new api.ApiError("Número de intento inválido.", 400));

    const { container } = render(<GameScreen />);
    await screen.findByRole("combobox");
    fireEvent.playing(container.querySelector("audio")!);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(await screen.findByText("Zafar"));
    fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Número de intento inválido.");
  });
});

async function chooseAndListen(container: HTMLElement) {
  await screen.findByRole("combobox");
  fireEvent.playing(container.querySelector("audio")!);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
  fireEvent.click(screen.getByText("Zafar"));
}

test("requires playback again when the next attempt uses the same audio URL", async () => {
  vi.mocked(api.getDailyState)
    .mockResolvedValueOnce(IN_PROGRESS_STATE)
    .mockResolvedValueOnce({ ...IN_PROGRESS_STATE, attempt_number: 2, attempts_remaining: 5 });
  vi.mocked(api.submitGuess).mockResolvedValue({} as api.GuessResult);
  const { container } = render(<GameScreen />);
  await chooseAndListen(container);
  const oldAudio = container.querySelector("audio");
  fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));
  await screen.findByText(/Intento 2 de 6/);
  expect(container.querySelector("audio")).not.toBe(oldAudio);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
  fireEvent.click(screen.getByText("Zafar"));
  expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
});

test("reconciles an uncertain POST before allowing another submission", async () => {
  vi.mocked(api.getDailyState).mockResolvedValue(IN_PROGRESS_STATE);
  vi.mocked(api.submitGuess).mockRejectedValue(new Error("connection lost"));
  const { container } = render(<GameScreen />);
  await chooseAndListen(container);
  fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));
  const refresh = await screen.findByRole("button", { name: /actualizar partida/i });
  expect(screen.getByRole("combobox")).toHaveValue("Zafar");
  expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
  fireEvent.click(refresh);
  await screen.findByText(/escuchá la pista/i);
  expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
});

test("keeps uncertain submissions blocked when their refresh also fails", async () => {
  vi.mocked(api.getDailyState)
    .mockResolvedValueOnce(IN_PROGRESS_STATE)
    .mockRejectedValue(new Error("offline"));
  vi.mocked(api.submitGuess).mockResolvedValue({} as api.GuessResult);
  const { container } = render(<GameScreen />);
  await chooseAndListen(container);
  fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));
  await screen.findByRole("button", { name: /actualizar partida/i });
  expect(screen.getByRole("combobox")).toHaveValue("Zafar");
  fireEvent.playing(container.querySelector("audio")!);
  expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
});

test("blocks an attempt if playback fails after a selection", async () => {
  vi.mocked(api.getDailyState).mockResolvedValue(IN_PROGRESS_STATE);
  const { container } = render(<GameScreen />);
  await chooseAndListen(container);
  fireEvent.error(container.querySelector("audio")!);
  expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
});
