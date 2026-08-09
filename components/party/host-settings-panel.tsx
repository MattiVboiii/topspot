"use client";

import { isGuestOnline } from "@/lib/party/queue";
import type {
  DownvoteMode,
  GuestMode,
  Party,
  PartyGuest,
  SpotifyPlaylistSummary,
  SpotifySearchTrack,
} from "@/lib/types/party";
import { useEffect, useState } from "react";

type Props = {
  party: Party;
  partyId: string;
  guests: PartyGuest[];
  getIdToken: () => Promise<string>;
  onClose: () => void;
};

export function HostSettingsPanel({
  party,
  partyId,
  guests,
  getIdToken,
  onClose,
}: Props) {
  const [guestMode, setGuestMode] = useState<GuestMode>(party.guestMode);
  const [downvoteMode, setDownvoteMode] = useState<DownvoteMode>(
    party.downvoteMode ?? "off",
  );
  const [threshold, setThreshold] = useState(
    String(party.downvoteThreshold ?? 3),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setPresenceTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setPresenceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const [playlistQuery, setPlaylistQuery] = useState("");
  const [playlists, setPlaylists] = useState<SpotifyPlaylistSummary[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] =
    useState<SpotifyPlaylistSummary | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifySearchTrack[]>(
    [],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [addingFallback, setAddingFallback] = useState(false);
  const [transferringId, setTransferringId] = useState<string | null>(null);

  useEffect(() => {
    const q = playlistQuery.trim();
    if (q.length < 2) {
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoadingPlaylists(true);
      try {
        const res = await fetch(
          `/api/parties/${partyId}/playlists?q=${encodeURIComponent(q)}`,
        );
        const data = (await res.json()) as {
          playlists?: SpotifyPlaylistSummary[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Search failed");
        setPlaylists(data.playlists ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Playlist search failed");
      } finally {
        setLoadingPlaylists(false);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [playlistQuery, partyId]);

  async function saveSettings(
    extra?: Partial<{
      guestMode: GuestMode;
      downvoteMode: DownvoteMode;
      downvoteThreshold: number | null;
      isActive: boolean;
    }>,
  ) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestMode,
          downvoteMode,
          downvoteThreshold:
            downvoteMode === "threshold" ||
            downvoteMode === "score_and_threshold"
              ? Math.max(1, Number(threshold) || 1)
              : null,
          ...extra,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function openPlaylist(playlist: SpotifyPlaylistSummary) {
    setSelectedPlaylist(playlist);
    setSelectedIds(new Set());
    setError(null);
    try {
      const res = await fetch(
        `/api/parties/${partyId}/playlists?playlistId=${encodeURIComponent(playlist.id)}`,
      );
      const data = (await res.json()) as {
        tracks?: SpotifySearchTrack[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load tracks");
      setPlaylistTracks(data.tracks ?? []);
      setSelectedIds(new Set((data.tracks ?? []).map((t) => t.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tracks");
    }
  }

  async function addFallback(all: boolean) {
    if (!selectedPlaylist) return;
    setAddingFallback(true);
    setError(null);
    try {
      const tracks = all
        ? playlistTracks
        : playlistTracks.filter((t) => selectedIds.has(t.id));
      if (!tracks.length) throw new Error("Select at least one track");

      const token = await getIdToken();
      const res = await fetch(`/api/parties/${partyId}/tracks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tracks, source: "fallback" }),
      });
      const data = (await res.json()) as { error?: string; tracks?: unknown[] };
      if (!res.ok) throw new Error(data.error || "Could not add fallback");

      await fetch(`/api/parties/${partyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fallbackPlaylistId: selectedPlaylist.id,
          fallbackPlaylistName: selectedPlaylist.name,
        }),
      });

      setMessage(
        `Added ${data.tracks?.length ?? tracks.length} fallback track(s)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add fallback");
    } finally {
      setAddingFallback(false);
    }
  }

  async function transferTo(guest: PartyGuest) {
    setTransferringId(guest.id);
    setError(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id, action: "assign" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not offer control");
      setMessage(
        `Music control offered to ${guest.spotifyDisplayName || guest.displayName || "guest"}. They must accept on their device. You stay the party owner.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not offer control");
    } finally {
      setTransferringId(null);
    }
  }

  async function reclaimControl() {
    setError(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reclaim" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not reclaim");
      setMessage("Music control is back on your account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reclaim");
    }
  }

  const eligibleGuests = guests.filter(
    (g) =>
      g.spotifyId &&
      g.isPremium &&
      g.spotifyId !== party.hostSpotifyId &&
      isGuestOnline(g),
  );
  const controlDelegated =
    (party.playbackSpotifyId || party.hostSpotifyId) !== party.hostSpotifyId;
  const controllerGuest = guests.find((g) => g.id === party.playbackGuestId);
  const onlineCount = guests.filter((g) => isGuestOnline(g)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b1520] sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <h2 className="text-lg font-semibold text-white">Party settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-white/70 hover:bg-white/10"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-4 py-5">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Guest identity
            </h3>
            <select
              value={guestMode}
              onChange={(e) => setGuestMode(e.target.value as GuestMode)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
            >
              <option value="anonymous">Anonymous</option>
              <option value="named">By name</option>
            </select>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Downvotes
            </h3>
            <select
              value={downvoteMode}
              onChange={(e) => setDownvoteMode(e.target.value as DownvoteMode)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
            >
              <option value="off">Off (upvote only)</option>
              <option value="score">Score sorting (ups − downs)</option>
              <option value="threshold">Remove at threshold</option>
              <option value="score_and_threshold">
                Score sorting + remove at threshold
              </option>
            </select>
            {(downvoteMode === "threshold" ||
              downvoteMode === "score_and_threshold") && (
              <label className="mt-3 block text-sm text-white/70">
                Remove when downvotes reach
                <input
                  type="number"
                  min={1}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
                />
              </label>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Fallback playlist
            </h3>
            <p className="mb-3 text-sm text-white/55">
              Search any Spotify playlist, then add selected songs or the whole
              list. Fallback plays only when there are no requests.
            </p>
            <input
              value={playlistQuery}
              onChange={(e) => {
                setPlaylistQuery(e.target.value);
                if (e.target.value.trim().length < 2) {
                  setPlaylists([]);
                }
              }}
              placeholder="Search playlists…"
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none ring-emerald-400/40 focus:ring-2"
            />
            {loadingPlaylists && (
              <p className="mt-2 text-sm text-white/50">Searching…</p>
            )}
            {!selectedPlaylist && (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {playlists.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => void openPlaylist(p)}
                      className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-white/50">
                          {p.ownerName} · {p.trackCount} tracks
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedPlaylist && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-white">
                    {selectedPlaylist.name}
                  </p>
                  <button
                    type="button"
                    className="text-sm text-emerald-300"
                    onClick={() => {
                      setSelectedPlaylist(null);
                      setPlaylistTracks([]);
                    }}
                  >
                    Back
                  </button>
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {playlistTracks.map((track) => {
                    const checked = selectedIds.has(track.id);
                    return (
                      <li key={track.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(track.id)) next.delete(track.id);
                                else next.add(track.id);
                                return next;
                              });
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-white">
                            {track.name}
                            <span className="text-white/45">
                              {" "}
                              · {track.artists}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={addingFallback}
                    onClick={() => void addFallback(false)}
                    className="flex-1 rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-sky-950 disabled:opacity-50"
                  >
                    Add selected
                  </button>
                  <button
                    type="button"
                    disabled={addingFallback}
                    onClick={() => void addFallback(true)}
                    className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Add whole playlist
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              People in party ({onlineCount} online · {guests.length} joined)
            </h3>
            {controlDelegated && (
              <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-100">
                  Music control is with{" "}
                  {controllerGuest?.spotifyDisplayName ||
                    controllerGuest?.displayName ||
                    "a guest"}
                  . You still own this party.
                </p>
                <button
                  type="button"
                  onClick={() => void reclaimControl()}
                  className="mt-2 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-950"
                >
                  Take music control back
                </button>
              </div>
            )}
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {guests.map((g) => {
                const online = isGuestOnline(g);
                const status = !online
                  ? "Away"
                  : g.isSearching
                    ? "Looking for songs"
                    : "Online";
                return (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {g.displayName ||
                          g.spotifyDisplayName ||
                          "Anonymous guest"}
                        {g.spotifyId === party.hostSpotifyId ? " (owner)" : ""}
                        {g.id === party.playbackGuestId ? " · music" : ""}
                      </p>
                      <p className="text-xs text-white/45">
                        <span
                          className={
                            online
                              ? g.isSearching
                                ? "text-sky-300"
                                : "text-emerald-300"
                              : "text-white/40"
                          }
                        >
                          {status}
                        </span>
                        {" · "}
                        {g.spotifyId
                          ? g.isPremium
                            ? "Spotify Premium linked"
                            : "Spotify linked"
                          : "Guest"}
                      </p>
                    </div>
                    {eligibleGuests.some((e) => e.id === g.id) && (
                      <button
                        type="button"
                        disabled={transferringId === g.id}
                        onClick={() => void transferTo(g)}
                        className="shrink-0 rounded-lg bg-amber-400/90 px-2.5 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
                      >
                        Give music
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Party
            </h3>
            <button
              type="button"
              onClick={() => void saveSettings({ isActive: false })}
              className="w-full rounded-xl border border-red-400/40 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/10"
            >
              End party
            </button>
          </section>

          {error && <p className="text-sm text-red-300">{error}</p>}
          {message && <p className="text-sm text-emerald-300">{message}</p>}
        </div>

        <footer className="border-t border-white/10 p-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSettings()}
            className="w-full rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </footer>
      </div>
    </div>
  );
}
