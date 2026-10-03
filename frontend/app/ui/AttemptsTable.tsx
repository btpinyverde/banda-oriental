// frontend/app/ui/AttemptsTable.tsx
import { Icon } from "./Icon";
import type { AttemptHistoryEntry } from "../lib/api";

const FEEDBACK_LABEL: Record<string, string> = {
  exact: "Año exacto",
  older: "Es más vieja",
  newer: "Es más nueva",
  same: "Coincide",
  different: "No coincide",
  unknown: "Sin dato",
};

function feedbackClass(value: string): string {
  if (value === "exact" || value === "same") return "attempts-table__cell--match";
  if (value === "unknown") return "attempts-table__cell--unknown";
  return "attempts-table__cell--miss";
}

interface AttemptsTableProps {
  attempts: AttemptHistoryEntry[];
  maxAttempts: number;
}

export function AttemptsTable({ attempts, maxAttempts }: AttemptsTableProps) {
  const rows = Array.from({ length: maxAttempts }, (_, index) => attempts[index] ?? null);

  return (
    <table className="attempts-table">
      <caption className="sr-only">Tus intentos de hoy, con las pistas de cada uno.</caption>
      <thead>
        <tr>
          <th scope="col">Canción</th>
          <th scope="col">Año</th>
          <th scope="col">Género</th>
          <th scope="col">Artista</th>
          <th scope="col">Disco</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry, index) =>
          entry ? (
            <tr key={entry.attempt_number}>
              <td>{entry.guessed_text}</td>
              <td className={feedbackClass(entry.feedback.year)}>
                {entry.feedback.year === "exact" && <Icon name="check" size={16} />}
                {FEEDBACK_LABEL[entry.feedback.year]}
              </td>
              <td className={feedbackClass(entry.feedback.genre)}>{FEEDBACK_LABEL[entry.feedback.genre]}</td>
              <td className={feedbackClass(entry.feedback.artist)}>{FEEDBACK_LABEL[entry.feedback.artist]}</td>
              <td className={feedbackClass(entry.feedback.album)}>{FEEDBACK_LABEL[entry.feedback.album]}</td>
            </tr>
          ) : (
            <tr key={`empty-${index}`}>
              <td colSpan={5} className="attempts-table__empty" aria-label={`Intento ${index + 1} disponible`}>
                <span aria-hidden="true">—</span>
              </td>
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}
