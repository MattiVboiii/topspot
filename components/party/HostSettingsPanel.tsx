"use client";

import { HostDangerZone } from "@/components/party/HostDangerZone";
import { HostFallbackPlaylist } from "@/components/party/HostFallbackPlaylist";
import { HostSettingsGeneral } from "@/components/party/HostSettingsGeneral";
import { HostTransferSection } from "@/components/party/HostTransferSection";
import { fill, useT } from "@/lib/i18n/LocaleProvider";
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
            guest.spotifyDisplayName || guest.displayName || t.common.guest,
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
          <HostSettingsGeneral
            guestMode={guestMode}
            downvoteMode={downvoteMode}
            threshold={threshold}
            trackCooldownMinutes={trackCooldownMinutes}
            maxActiveRequestsPerGuest={maxActiveRequestsPerGuest}
            onGuestModeChange={setGuestMode}
            onDownvoteModeChange={setDownvoteMode}
            onThresholdChange={setThreshold}
            onTrackCooldownChange={setTrackCooldownMinutes}
            onMaxRequestsChange={setMaxActiveRequestsPerGuest}
          />

          <HostFallbackPlaylist
            playlistQuery={playlistQuery}
            playlists={playlists}
            selectedPlaylist={selectedPlaylist}
            playlistTracks={playlistTracks}
            selectedIds={selectedIds}
            loadingPlaylists={loadingPlaylists}
            addingFallback={addingFallback}
            onPlaylistQueryChange={(value) => {
              setPlaylistQuery(value);
              if (value.trim().length < 2) {
                setPlaylists([]);
              }
            }}
            onOpenPlaylist={(playlist) => void openPlaylist(playlist)}
            onClearPlaylist={() => {
              setSelectedPlaylist(null);
              setPlaylistTracks([]);
            }}
            onToggleTrack={(trackId) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(trackId)) next.delete(trackId);
                else next.add(trackId);
                return next;
              });
            }}
            onAddFallback={(all) => void addFallback(all)}
          />

          <HostTransferSection
            party={party}
            guests={guests}
            eligibleGuests={eligibleGuests}
            controlDelegated={controlDelegated}
            controllerGuest={controllerGuest}
            onlineCount={onlineCount}
            transferringId={transferringId}
            onTransferTo={(guest) => void transferTo(guest)}
            onReclaimControl={() => void reclaimControl()}
          />

          <HostDangerZone
            onEndParty={() => void saveSettings({ isActive: false })}
          />

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
