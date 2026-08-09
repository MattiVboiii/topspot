"use client";

import { formatDuration } from "@/lib/party/codes";
import type { SpotifySearchTrack } from "@/lib/types/party";
import { useEffect, useState } from "react";

type Props = {
  partyId: string;
  onAdd: (track: SpotifySearchTrack) => Promise<void>;
};

export function TrackSearch({ partyId, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/parties/${partyId}/search?q=${encodeURIComponent(q)}`,
        );
        const data = (await res.json()) as {
          tracks?: SpotifySearchTrack[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Search failed");
        setResults(data.tracks ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [query, partyId]);

  const visibleResults = query.trim().length < 2 ? [] : results;

  return (
    <div className="flex flex-col gap-3">
      <label className="sr-only" htmlFor="track-search">
        Search tracks
      </label>
      <input
        id="track-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) {
            setResults([]);
          }
        }}
        placeholder="Search Spotify tracks…"
        className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none ring-emerald-400/40 focus:ring-2"
      />
      {loading && <p className="text-sm text-white/50">Searching…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {visibleResults.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2"
          >
            {track.albumArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.albumArtUrl}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {track.name}
              </p>
              <p className="truncate text-xs text-white/55">
                {track.artists} · {formatDuration(track.durationMs)}
              </p>
            </div>
            <button
              type="button"
              disabled={addingId === track.id}
              onClick={async () => {
                setAddingId(track.id);
                try {
                  await onAdd(track);
                  setQuery("");
                  setResults([]);
                } finally {
                  setAddingId(null);
                }
              }}
              className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-emerald-950 disabled:opacity-50"
            >
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
