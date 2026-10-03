// frontend/app/lib/api.ts
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface StemInfo {
  stem_type: "drums" | "bass" | "vocals" | "other";
  unlock_order: number;
  url: string;
}

export interface GuessFeedback {
  year: "exact" | "older" | "newer" | "unknown";
  genre: "same" | "different" | "unknown";
  artist: "same" | "different" | "unknown";
  album: "same" | "different" | "unknown";
}

export interface AttemptHistoryEntry {
  attempt_number: number;
  guessed_text: string;
  feedback: GuessFeedback;
}

export interface DailyStateInProgress {
  finished: false;
  day: string;
  attempt_number: number;
  attempts_remaining: number;
  unlocked_stems: StemInfo[];
  feedback_history: AttemptHistoryEntry[];
}

export interface DailyStateFinished {
  finished: true;
  day: string;
  won: boolean;
  score_submitted: boolean;
  song: { title: string; artist: string; album: string };
  score?: number;
  winning_attempt?: number;
}

export type DailyState = DailyStateInProgress | DailyStateFinished;

export interface GuessResult {
  is_correct: boolean;
  attempt_number: number;
  feedback: GuessFeedback;
  finished: boolean;
  attempts_remaining: number;
}

export interface SongOption {
  id: number;
  title: string;
  artist: string;
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    const details = Object.values(body).flat().filter((value) => typeof value === "string");
    return details.join(" ") || "Error inesperado.";
  } catch {
    return "Error inesperado.";
  }
}

export async function getDailyState(deviceId: string): Promise<DailyState | null> {
  const response = await fetch(`${API_BASE_URL}/api/daily/`, {
    headers: { "X-Device-Id": deviceId },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(await parseErrorDetail(response), response.status);
  return response.json();
}

export async function submitGuess(
  deviceId: string,
  attemptNumber: number,
  songId: number
): Promise<GuessResult> {
  const response = await fetch(`${API_BASE_URL}/api/daily/guess/`, {
    method: "POST",
    headers: { "X-Device-Id": deviceId, "Content-Type": "application/json" },
    body: JSON.stringify({ attempt_number: attemptNumber, song_id: songId }),
  });
  if (!response.ok) throw new ApiError(await parseErrorDetail(response), response.status);
  return response.json();
}

export async function listSongs(): Promise<SongOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/songs/`, { cache: "no-store" });
  if (!response.ok) throw new ApiError(await parseErrorDetail(response), response.status);
  const data: { songs: SongOption[] } = await response.json();
  return data.songs;
}
