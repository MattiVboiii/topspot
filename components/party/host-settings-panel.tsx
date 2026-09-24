"use client";

import { CoverArt } from "@/components/party/cover-art";
import { fill, useT } from "@/lib/i18n/provider";
import { isGuestOnline } from "@/lib/party/queue";
import type {
  DownvoteMode,
  GuestMode,
  Party,
  PartyGuest,
  SpotifyPlaylistSummary,
  SpotifySearchTrack,
} from "@/lib/types/party";
import { useRouter } from "next/navigation";
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
  const t = useT();
  const router = useRouter();
  const [guestMode, setGuestMode] = useState<GuestMode>(party.guestMode);
  const [downvoteMode, setDownvoteMode] = useState<DownvoteMode>(
    party.downvoteMode ?? "off",
  );
  const [threshold, setThreshold] = useState(
    String(party.downvoteThreshold ?? 3),
  );
  const [trackCooldownMinutes, setTrackCooldownMinutes] = useState(
    String(party.trackCooldownMinutes ?? 30),
  );
  const [maxActiveRequestsPerGuest, setMaxActiveRequestsPerGuest] = useState(
    String(party.maxActiveRequestsPerGuest ?? 3),
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
      trackCooldownMinutes: number;
      maxActiveRequestsPerGuest: number;
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
          trackCooldownMinutes: Math.max(
            0,
            Math.min(24 * 60, Math.floor(Number(trackCooldownMinutes) || 0)),
          ),
          maxActiveRequestsPerGuest: Math.max(
            0,
            Math.min(50, Math.floor(Number(maxActiveRequestsPerGuest) || 0)),
          ),
          ...extra,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (extra?.isActive === false) {
        router.push(`/host/${partyId}/recap`);
        return;
      }
      setMessage(t.settings.saved);
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
      if (!tracks.length) throw new Error(t.settings.selectOneTrack);

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
        fill(t.settings.fallbackAdded, {
          count: data.tracks?.length ?? tracks.length,
        }),
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
        fill(t.settings.transferOffered, {
          name:
            guest.spotifyDisplayName ||
            guest.displayName ||
            t.common.guest,
        }),
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
      setMessage(t.settings.controlBack);
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
          <h2 className="text-lg font-semibold text-white">
            {t.settings.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-white/70 hover:bg-white/10"
          >
            {t.common.close}
          </button>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-4 py-5">
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              {t.settings.guestIdentity}
            </h3>
            <select
              value={guestMode}
              onChange={(e) => setGuestMode(e.target.value as GuestMode)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
            >
              <option value="anonymous">{t.settings.anonymous}</option>
              <option value="named">{t.settings.named}</option>
            </select>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              {t.settings.downvotes}
            </h3>
            <select
              value={downvoteMode}
              onChange={(e) => setDownvoteMode(e.target.value as DownvoteMode)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
            >
              <option value="off">{t.settings.downvoteOff}</option>
              <option value="score">{t.settings.downvoteScore}</option>
              <option value="threshold">{t.settings.downvoteThreshold}</option>
              <option value="score_and_threshold">
                {t.settings.downvoteScoreAndThreshold}
              </option>
            </select>
            {(downvoteMode === "threshold" ||
              downvoteMode === "score_and_threshold") && (
              <label className="mt-3 block text-sm text-white/70">
                {t.settings.removeAtDownvotes}
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
              {t.settings.queueLimits}
            </h3>
            <label className="block text-sm text-white/70">
              {t.settings.cooldownLabel}
              <input
                type="number"
                min={0}
                max={1440}
                value={trackCooldownMinutes}
                onChange={(e) => setTrackCooldownMinutes(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
              />
              <span className="mt-1 block text-xs text-white/45">
                {t.settings.cooldownHint}
              </span>
            </label>
            <label className="mt-4 block text-sm text-white/70">
              {t.settings.maxRequestsLabel}
              <input
                type="number"
                min={0}
                max={50}
                value={maxActiveRequestsPerGuest}
                onChange={(e) => setMaxActiveRequestsPerGuest(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-white"
              />
              <span className="mt-1 block text-xs text-white/45">
                {t.settings.maxRequestsHint}
              </span>
            </label>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              {t.settings.fallbackTitle}
            </h3>
            <p className="mb-3 text-sm text-white/55">
              {t.settings.fallbackBody}
            </p>
            <input
              value={playlistQuery}
              onChange={(e) => {
                setPlaylistQuery(e.target.value);
                if (e.target.value.trim().length < 2) {
                  setPlaylists([]);
                }
              }}
              placeholder={t.settings.searchPlaylists}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 outline-none ring-emerald-400/40 focus:ring-2"
            />
            {loadingPlaylists && (
              <p className="mt-2 text-sm text-white/50">{t.settings.searchingPlaylists}</p>
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
                        <CoverArt
                          src={p.imageUrl}
                          size={40}
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
                          {p.ownerName} ·{" "}
                          {fill(t.settings.tracksCount, {
                            count: p.trackCount,
                          })}
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
                        {t.settings.back}
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
                    {t.settings.addSelected}
                  </button>
                  <button
                    type="button"
                    disabled={addingFallback}
                    onClick={() => void addFallback(true)}
                    className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {t.settings.addWholePlaylist}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              {t.settings.peopleTitle} ({fill(t.settings.peopleCounts, { online: onlineCount, joined: guests.length })})
            </h3>
            {controlDelegated && (
              <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                <p className="text-sm text-amber-100">
                  {fill(t.settings.musicControlWith, {
                    name:
                      controllerGuest?.spotifyDisplayName ||
                      controllerGuest?.displayName ||
                      t.common.guest,
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => void reclaimControl()}
                  className="mt-2 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-950"
                >
                  {t.settings.takeMusicBack}
                </button>
              </div>
            )}
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {guests.map((g) => {
                const online = isGuestOnline(g);
                const status = !online
                  ? t.common.away
                  : g.isSearching
                    ? t.settings.lookingForSongs
                    : t.common.online;
                return (
                  <li
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {g.displayName ||
                          g.spotifyDisplayName ||
                          t.settings.anonymousGuest}
                        {g.spotifyId === party.hostSpotifyId ? ` (${t.common.owner})` : ""}
                        {g.id === party.playbackGuestId ? ` · ${t.settings.musicSuffix}` : ""}
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
                            ? t.settings.spotifyPremiumLinked
                            : t.settings.spotifyLinked
                          : t.common.guest}
                      </p>
                    </div>
                    {eligibleGuests.some((e) => e.id === g.id) && (
                      <button
                        type="button"
                        disabled={transferringId === g.id}
                        onClick={() => void transferTo(g)}
                        className="shrink-0 rounded-lg bg-amber-400/90 px-2.5 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
                      >
                        {t.settings.giveMusic}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              {t.settings.partySection}
            </h3>
            <button
              type="button"
              onClick={() => void saveSettings({ isActive: false })}
              className="w-full rounded-xl border border-red-400/40 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/10"
            >
              {t.settings.endParty}
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
            {saving ? t.common.saving : t.common.save}
          </button>
        </footer>
      </div>
    </div>
  );
}
