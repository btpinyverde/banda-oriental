// frontend/app/ui/SongSearch.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SongSearch } from "./SongSearch";

const SONGS = [
  { id: 1, title: "Zafar", artist: "No Te Va Gustar" },
  { id: 2, title: "A las nueve", artist: "El Cuarteto de Nos" },
];

describe("SongSearch", () => {
  test("filters songs by title or artist as the user types", () => {
    render(<SongSearch songs={SONGS} onSelect={vi.fn()} disabled={false} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cuarteto" } });

    expect(screen.getByText("A las nueve")).toBeInTheDocument();
    expect(screen.queryByText("Zafar")).not.toBeInTheDocument();
  });

  test("shows a no-results message for an unmatched query", () => {
    render(<SongSearch songs={SONGS} onSelect={vi.fn()} disabled={false} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "xyz-no-existe" } });

    expect(screen.getByText(/no encontramos esa canción/i)).toBeInTheDocument();
  });

  test("calls onSelect and preserves the chosen title when a result is clicked", () => {
    const onSelect = vi.fn();
    render(<SongSearch songs={SONGS} onSelect={onSelect} disabled={false} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(screen.getByText("Zafar"));

    expect(onSelect).toHaveBeenCalledWith(SONGS[0]);
    expect(screen.getByRole("combobox")).toHaveValue("Zafar");
  });

  test("selects the active result on Enter", () => {
    const onSelect = vi.fn();
    render(<SongSearch songs={SONGS} onSelect={onSelect} disabled={false} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalled();
  });

  test("is disabled while the audio has not started playing yet", () => {
    render(<SongSearch songs={SONGS} onSelect={vi.fn()} disabled={true} />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

test("editing a selection clears it and exposes the keyboard active option", () => {
  const onSelect = vi.fn();
  render(<SongSearch songs={SONGS} onSelect={onSelect} disabled={false} />);
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "zafar" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant", screen.getByRole("option").id);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.change(input, { target: { value: "otra" } });
  expect(onSelect).toHaveBeenLastCalledWith(null);
});
