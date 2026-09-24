"use client";

import { CoverArt } from "@/components/party/CoverArt";
import { formatDuration } from "@/lib/party/codes";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { SpotifySearchTrack } from "@/lib/types/party";
import { useEffect, useState } from "react";

type Props = {
  partyId: string;
  onAdd: (track: SpotifySearchTrack) => Promise<void>;
  /** Guest Firebase token getter — required for likes when not host session */
  getIdToken?: () => Promise<string>;
  /** Guest id for Spotify link OAuth */
  guestId?: string | null;
  spotifyLinked?: boolean;
  returnTo?: string;
  /** Fired when the guest is actively searching or browsing likes. */
  onSearchingChange?: (searching: boolean) => void;
};

type Tab = "search" | "likes";

export function TrackSearch({
  partyId,
  onAdd,
  getIdToken,
  guestId,
  spotifyLinked,
  returnTo,
  onSearchingChange,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchTrack[]>([]);
  const [likes, setLikes] = useState<SpotifySearchTrack[]>([]);
  const [likesOffset, setLikesOffset] = useState(0);
  const [likesTotal, setLikesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSpotify, setNeedsSpotify] = useState(false);

  useEffect(() => {
    const searching =
      (tab === "search" && query.trim().length >= 2) || tab === "likes";
    onSearchingChange?.(searching);
  }, [tab, query, onSearchingChange]);

  useEffect(() => {
    return () => {
      onSearchingChange?.(false);
    };
  }, [onSearchingChange]);

  useEffect(() => {
    const q = query.trim();
    if (tab !== "search" || q.length < 2) {
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
  }, [query, partyId, tab]);

  useEffect(() => {
    if (tab !== "likes") return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setNeedsSpotify(false);
      try {
        const headers: HeadersInit = {};
        if (getIdToken) {
          headers.Authorization = `Bearer ${await getIdToken()}`;
        }
        const res = await fetch(
          `/api/parties/${partyId}/likes?limit=20&offset=${likesOffset}`,
          { headers },
        );
        const data = (await res.json()) as {
          tracks?: SpotifySearchTrack[];
          total?: number;
          error?: string;
          needsSpotify?: boolean;
        };
        if (res.status === 401 && data.needsSpotify) {
          setNeedsSpotify(true);
          setLikes([]);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Could not load likes");
        if (cancelled) return;
        setLikes(data.tracks ?? []);
        setLikesTotal(data.total ?? 0);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load likes");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, partyId, likesOffset, getIdToken, spotifyLinked]);

  const visibleResults =
    tab === "search" ? (query.trim().length < 2 ? [] : results) : likes;

  const linkHref =
    guestId && returnTo
      ? `/api/auth/spotify?intent=guest-link&partyId=${encodeURIComponent(partyId)}&guestId=${encodeURIComponent(guestId)}&returnTo=${encodeURIComponent(returnTo)}`
      : `/api/auth/spotify?intent=host&returnTo=${encodeURIComponent(returnTo || "/")}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("search")}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
            tab === "search"
              ? "bg-emerald-400 text-emerald-950"
              : "bg-white/10 text-white"
          }`}
        >
          {t.search.tabSearch}
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("likes");
            setLikesOffset(0);
          }}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
            tab === "likes"
              ? "bg-emerald-400 text-emerald-950"
              : "bg-white/10 text-white"
          }`}
        >
          {t.search.tabLikes}
        </button>
      </div>

      {tab === "search" && (
        <>
          <label className="sr-only" htmlFor="track-search">
            {t.search.label}
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
            placeholder={t.search.placeholder}
            className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none ring-emerald-400/40 focus:ring-2"
          />
        </>
      )}

      {tab === "likes" && needsSpotify && (
        <div className="rounded-xl border border-white/15 bg-black/20 p-4 text-sm text-white/70">
          <p className="mb-3">{t.search.linkSpotifyBody}</p>
          <a
            href={linkHref}
            className="inline-flex rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-emerald-950"
          >
            {t.search.connectSpotify}
          </a>
        </div>
      )}

      {loading && <p className="text-sm text-white/50">{t.search.loading}</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {visibleResults.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2"
          >
            {track.albumArtUrl ? (
              <CoverArt
                src={track.albumArtUrl}
                size={40}
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
                setError(null);
                try {
                  await onAdd(track);
                  if (tab === "search") {
                    setQuery("");
                    setResults([]);
                  }
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : t.common.add,
                  );
                } finally {
                  setAddingId(null);
                }
              }}
              className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-emerald-950 disabled:opacity-50"
            >
              {t.common.add}
            </button>
          </li>
        ))}
      </ul>

      {tab === "likes" && !needsSpotify && likesTotal > 20 && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={likesOffset <= 0}
            onClick={() => setLikesOffset((o) => Math.max(0, o - 20))}
            className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {t.common.previous}
          </button>
          <button
            type="button"
            disabled={likesOffset + 20 >= likesTotal}
            onClick={() => setLikesOffset((o) => o + 20)}
            className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {t.common.next}
          </button>
        </div>
      )}
    </div>
  );
}
