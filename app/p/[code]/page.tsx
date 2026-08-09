"use client";

import { GuestNameGate } from "@/components/party/guest-name-gate";
import { QueueList } from "@/components/party/queue-list";
import { TrackSearch } from "@/components/party/track-search";
import { useGuestAuth } from "@/lib/hooks/use-guest-auth";
import { usePartyRealtime } from "@/lib/hooks/use-party-realtime";
import type { Party, SpotifySearchTrack } from "@/lib/types/party";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function GuestPartyPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const { ready, getIdToken, error: authError } = useGuestAuth();

  const [partyMeta, setPartyMeta] = useState<Party | null>(null);
  const [joined, setJoined] = useState(false);
  const [gateNeeded, setGateNeeded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());

  const {
    party,
    tracks,
    error: realtimeError,
  } = usePartyRealtime(joined ? (partyMeta?.id ?? null) : null);

  const joinParty = useCallback(
    async (displayName?: string) => {
      const token = await getIdToken();
      const res = await fetch(`/api/parties/by-code/${code}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName }),
      });
      const data = (await res.json()) as { party?: Party; error?: string };
      if (!res.ok || !data.party) {
        throw new Error(data.error || "Could not join party");
      }
      setPartyMeta(data.party);
      setJoined(true);
      setGateNeeded(false);

      const votesRes = await fetch(`/api/parties/${data.party.id}/votes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (votesRes.ok) {
        const votes = (await votesRes.json()) as { trackIds: string[] };
        setMyVotes(new Set(votes.trackIds));
      }
    },
    [code, getIdToken],
  );

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch(`/api/parties/by-code/${code}`);
        const data = (await res.json()) as { party?: Party; error?: string };
        if (!res.ok || !data.party) {
          throw new Error(data.error || "Party not found");
        }
        if (cancelled) return;
        setPartyMeta(data.party);
        if (data.party.guestMode === "named") {
          setGateNeeded(true);
        } else {
          await joinParty();
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [ready, code, joinParty]);

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

  async function onAdd(track: SpotifySearchTrack) {
    if (!partyMeta) return;
    const res = await authedFetch(`/api/parties/${partyMeta.id}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not add track");
    setMyVotes((prev) => new Set(prev).add(track.id));
  }

  async function onVote(trackId: string, action: "up" | "down") {
    if (!partyMeta) return;
    const res = await authedFetch(`/api/parties/${partyMeta.id}/votes`, {
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

  if (loadError || authError) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-red-300">{loadError || authError}</p>
        <Link href="/" className="text-emerald-300 underline">
          Back home
        </Link>
      </main>
    );
  }

  if (!ready || !partyMeta || (gateNeeded && !joined)) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-6 text-sm text-emerald-300/80">
          ← Topspot
        </Link>
        <p className="mb-2 text-sm uppercase tracking-[0.25em] text-white/50">
          Party {code}
        </p>
        {gateNeeded ? (
          <GuestNameGate
            onSubmit={async (name) => {
              await joinParty(name);
            }}
          />
        ) : (
          <p className="text-white/60">Joining party…</p>
        )}
      </main>
    );
  }

  const live = party ?? partyMeta;
  const nowPlaying = tracks.find((t) => t.id === live.nowPlayingTrackId);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6 pb-16">
      <header>
        <Link href="/" className="text-sm text-emerald-300/80">
          ← Topspot
        </Link>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
          Party {live.code}
        </h1>
        <p className="text-white/55">Hosted by {live.hostDisplayName}</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          Now playing
        </p>
        <p className="mt-1 text-xl font-semibold text-white">
          {nowPlaying?.name ?? "Waiting for the host…"}
        </p>
        <p className="text-sm text-white/55">{nowPlaying?.artists ?? ""}</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 font-semibold text-white">Add a track</h2>
        <TrackSearch partyId={live.id} onAdd={onAdd} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 font-semibold text-white">Queue</h2>
        {realtimeError && (
          <p className="mb-2 text-sm text-amber-200">{realtimeError}</p>
        )}
        <QueueList
          tracks={tracks}
          nowPlayingTrackId={live.nowPlayingTrackId}
          myVotes={myVotes}
          onVote={onVote}
        />
      </section>
    </main>
  );
}
