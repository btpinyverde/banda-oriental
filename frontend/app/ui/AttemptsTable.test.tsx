// frontend/app/ui/AttemptsTable.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AttemptsTable } from "./AttemptsTable";

const FEEDBACK = { year: "older", genre: "same", artist: "different", album: "unknown" } as const;

describe("AttemptsTable", () => {
  test("renders one row per recorded attempt with its guessed song", () => {
    render(
      <AttemptsTable
        attempts={[{ attempt_number: 1, guessed_text: "Zafar", feedback: FEEDBACK }]}
        maxAttempts={6}
      />
    );

    expect(screen.getByText("Zafar")).toBeInTheDocument();
  });

  test("pads remaining rows up to maxAttempts as empty", () => {
    render(<AttemptsTable attempts={[]} maxAttempts={6} />);

    expect(screen.getAllByLabelText(/intento \d disponible/i)).toHaveLength(6);
  });

  test("marks an exact year match distinctly from a mismatch", () => {
    render(
      <AttemptsTable
        attempts={[{ attempt_number: 1, guessed_text: "Zafar", feedback: { ...FEEDBACK, year: "exact" } }]}
        maxAttempts={6}
      />
    );

    expect(screen.getByText("Año exacto")).toHaveClass("attempts-table__cell--match");
  });

  test("labels an unknown axis without implying a match or a miss", () => {
    render(
      <AttemptsTable
        attempts={[{ attempt_number: 1, guessed_text: "Zafar", feedback: FEEDBACK }]}
        maxAttempts={6}
      />
    );

    expect(screen.getByText("Sin dato")).toHaveClass("attempts-table__cell--unknown");
  });
});
