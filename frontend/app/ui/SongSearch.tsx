// frontend/app/ui/SongSearch.tsx
"use client";

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "./Icon";
import type { SongOption } from "../lib/api";

function matchesQuery(song: SongOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return (
    song.title.toLowerCase().includes(normalized) || song.artist.toLowerCase().includes(normalized)
  );
}

interface SongSearchProps {
  songs: SongOption[];
  onSelect: (song: SongOption | null) => void;
  disabled: boolean;
}

export function SongSearch({ songs, onSelect, disabled }: SongSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const results = songs.filter((song) => matchesQuery(song, query)).slice(0, 8);

  function choose(song: SongOption) {
    onSelect(song);
    setQuery(song.title);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="song-search">
      <label htmlFor={`${listboxId}-input`} className="sr-only">
        Buscá una canción o artista
      </label>
      <div className="song-search__field">
        <Icon name="search" size={18} />
        <input
          id={`${listboxId}-input`}
          value={query}
          disabled={disabled}
          placeholder="Escribí una canción o artista…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && Boolean(query.trim())}
          aria-activedescendant={open && results[activeIndex] ? `${listboxId}-${results[activeIndex].id}` : undefined}
          aria-controls={listboxId}
          onChange={(event) => {
            onSelect(null);
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(Boolean(query.trim()))}
          onBlur={() => setOpen(false)}
        />
      </div>
      {open && query.trim() && (
        <ul id={listboxId} role="listbox" className="song-search__results">
          {results.length > 0 ? (
            results.map((song, index) => (
              <li
                key={song.id}
                id={`${listboxId}-${song.id}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(song)}
              >
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </li>
            ))
          ) : (
            <li role="presentation" className="song-search__empty">
              No encontramos esa canción en el catálogo.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
