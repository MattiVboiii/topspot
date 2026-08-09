"use client";

import { HostControls } from "@/components/party/host-controls";
import { QrCard } from "@/components/party/qr-card";
import { QueueList } from "@/components/party/queue-list";
import { TrackSearch } from "@/components/party/track-search";
import { useGuestAuth } from "@/lib/hooks/use-guest-auth";
import { usePartyRealtime } from "@/lib/hooks/use-party-realtime";
import { useSpotifyPlayer } from "@/lib/hooks/use-spotify-player";
import type { GuestMode, SpotifySearchTrack } from "@/lib/types/party";
import Link from "next/link";
import { useParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function HostPartyPage() {
  const params = useParams<{ partyId: string }>();
  const partyId = params.partyId;
  const [authState, setAuthState] = useState<"loading" | "in" | "out">(
    "loading",
  );
  const [sdkReady, setSdkReady] = useState(false);
  const { party, tracks, error: realtimeError } = usePartyRealtime(partyId);
  const { ready: guestReady, getIdToken, error: guestError } = useGuestAuth();
  const {
    ready: playerReady,
    error: playerError,
    status: playerStatus,
  } = useSpotifyPlayer(
    authState === "in" && Boolean(partyId) && sdkReady,
    partyId,
  );

  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const joinUrl = useMemo(() => {
    if (!party?.code) return "";
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "";
    return `${origin}/p/${party.code}`;
  }, [party?.code]);

  useEffect(() => {
    const markReady = () => {
      if (window.Spotify) setSdkReady(true);
    };
    markReady();
    window.addEventListener("spotify-sdk-ready", markReady);
    const previous = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      try {
        previous?.();
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("spotify-sdk-ready"));
      markReady();
    };
    return () => {
      window.removeEventListener("spotify-sdk-ready", markReady);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { authenticated?: boolean }) => {
        if (cancelled) return;
        setAuthState(data.authenticated ? "in" : "out");
      })
      .catch(() => {
        if (!cancelled) setAuthState("out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!party || authState !== "in") return;
    async function ensureHostGuest() {
      if (!guestReady) return;
      const token = await getIdToken();
      await fetch(`/api/parties/by-code/${party!.code}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: party!.hostDisplayName,
        }),
      });
      const votesRes = await fetch(`/api/parties/${partyId}/votes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (votesRes.ok) {
        const data = (await votesRes.json()) as { trackIds: string[] };
        setMyVotes(new Set(data.trackIds));
      }
    }
    void ensureHostGuest();
  }, [party, authState, guestReady, getIdToken, partyId]);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getIdToken();
      return fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    },
    [getIdToken],
  );

  async function control(action: "play" | "pause" | "skip") {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Control failed");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Control failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(track: SpotifySearchTrack) {
    const res = await authedFetch(`/api/parties/${partyId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not add track");
    setMyVotes((prev) => new Set(prev).add(track.id));
  }

  async function onVote(trackId: string, action: "up" | "down") {
    const res = await authedFetch(`/api/parties/${partyId}/votes`, {
      method: "POST",
      body: JSON.stringify({ trackId, action }),
    });
    if (!res.ok) return;
    setMyVotes((prev) => {
      const next = new Set(prev);
      if (action === "up") next.add(trackId);
      else next.delete(trackId);
      return next;
    });
  }

  async function onRemove(trackId: string) {
    await fetch(
      `/api/parties/${partyId}/tracks?trackId=${encodeURIComponent(trackId)}`,
      { method: "DELETE" },
    );
  }

  async function setGuestMode(mode: GuestMode) {
    await fetch(`/api/parties/${partyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestMode: mode }),
    });
  }

  if (authState === "out") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-white/70">
          Sign in as the host to control this party.
        </p>
        <a
          href="/api/auth/spotify"
          className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
        >
          Sign in with Spotify
        </a>
      </main>
    );
  }

  if (!party) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-white/60">
        {realtimeError || guestError || "Loading party…"}
      </main>
    );
  }

  const nowPlaying = tracks.find((t) => t.id === party.nowPlayingTrackId);

  return (
    <>
      <Script
        src="https://sdk.scdn.co/spotify-player.js"
        strategy="afterInteractive"
        onReady={() => {
          if (window.Spotify) {
            setSdkReady(true);
            window.dispatchEvent(new Event("spotify-sdk-ready"));
          }
        }}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm text-emerald-300/80 hover:underline"
            >
              ← Topspot
            </Link>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
              Host dashboard
            </h1>
            <p className="text-white/60">Playing as {party.hostDisplayName}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-white/45">
              Guest mode
            </label>
            <select
              value={party.guestMode}
              onChange={(e) => void setGuestMode(e.target.value as GuestMode)}
              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
            >
              <option value="anonymous">Anonymous</option>
              <option value="named">By name</option>
            </select>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <QrCard joinUrl={joinUrl} code={party.code} />

          <section className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                Now playing
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {nowPlaying ? nowPlaying.name : "Nothing yet"}
              </p>
              <p className="text-white/55">
                {nowPlaying ? nowPlaying.artists : "Add tracks and hit Play"}
              </p>
              <div className="mt-5">
                <HostControls
                  isPaused={party.isPaused || !party.nowPlayingTrackId}
                  playerReady={playerReady}
                  busy={busy}
                  status={sdkReady ? playerStatus : "loading_sdk"}
                  onPlay={() => void control("play")}
                  onPause={() => void control("pause")}
                  onSkip={() => void control("skip")}
                />
              </div>
              {(playerError || actionError) && (
                <p className="mt-3 text-sm text-amber-200">
                  {actionError || playerError}
                </p>
              )}
              {!playerReady && !playerError && (
                <p className="mt-2 text-xs text-white/45">
                  Use Chrome, Edge, or Firefox. Spotify Premium required. Keep
                  this tab open while music plays.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">
                Add tracks
              </h2>
              <TrackSearch partyId={partyId} onAdd={onAdd} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Queue</h2>
              <QueueList
                tracks={tracks}
                nowPlayingTrackId={party.nowPlayingTrackId}
                myVotes={myVotes}
                isHost
                onVote={onVote}
                onRemove={onRemove}
              />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
