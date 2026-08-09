"use client";

import { GuestNameGate } from "@/components/party/guest-name-gate";
import { HostTransferBanner } from "@/components/party/host-transfer-banner";
import {
  HowItWorks,
  markHowItWorksSeen,
  useHowItWorksDismissed,
} from "@/components/party/how-it-works";
import { NowPlayingBar } from "@/components/party/now-playing-bar";
import { QrCard } from "@/components/party/qr-card";
import { QueueList } from "@/components/party/queue-list";
import { TrackSearch } from "@/components/party/track-search";
import { useGuestAuth } from "@/lib/hooks/use-guest-auth";
import { useGuestPresence } from "@/lib/hooks/use-guest-presence";
import { usePartyRealtime } from "@/lib/hooks/use-party-realtime";
import type { Party, SpotifySearchTrack } from "@/lib/types/party";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const GUEST_HOWTO_KEY = "topspot_guest_howto_v1";

export default function GuestPartyPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const { ready, user, getIdToken, error: authError } = useGuestAuth();

  const howtoSeen = useHowItWorksDismissed(GUEST_HOWTO_KEY);
  const [howtoJustDismissed, setHowtoJustDismissed] = useState(false);
  const explained = howtoSeen || howtoJustDismissed;
  const [partyMeta, setPartyMeta] = useState<Party | null>(null);
  const [joined, setJoined] = useState(false);
  const [gateNeeded, setGateNeeded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [guestId, setGuestId] = useState<string | null>(null);
  const [spotifyLinked, setSpotifyLinked] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const {
    party,
    tracks,
    error: realtimeError,
  } = usePartyRealtime(joined ? (partyMeta?.id ?? null) : null);

  const joinUrl = useMemo(() => {
    const partyCode = (party ?? partyMeta)?.code || code;
    if (!partyCode) return "";
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "";
    return `${origin}/p/${partyCode}`;
  }, [party, partyMeta, code]);

  useGuestPresence({
    partyId: joined ? (partyMeta?.id ?? null) : null,
    enabled: joined && Boolean(guestId),
    isSearching,
    getIdToken,
  });

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
      const data = (await res.json()) as {
        party?: Party;
        guestId?: string;
        error?: string;
      };
      if (!res.ok || !data.party) {
        throw new Error(data.error || "Could not join party");
      }
      setPartyMeta(data.party);
      setJoined(true);
      setGateNeeded(false);
      if (data.guestId) setGuestId(data.guestId);

      const votesRes = await fetch(`/api/parties/${data.party.id}/votes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (votesRes.ok) {
        const votes = (await votesRes.json()) as {
          votes?: Record<string, 1 | -1>;
        };
        setMyVotes(votes.votes ?? {});
      }
    },
    [code, getIdToken],
  );

  useEffect(() => {
    if (!ready || !explained) return;
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
  }, [ready, code, joinParty, explained]);

  useEffect(() => {
    if (!guestId || !partyMeta?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/parties/${partyMeta.id}/likes?limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setSpotifyLinked(res.ok);
      } catch {
        if (!cancelled) setSpotifyLinked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestId, partyMeta?.id, getIdToken]);

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
      body: JSON.stringify({ track, source: "request" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not add track");
    setMyVotes((prev) => ({ ...prev, [track.id]: 1 }));
  }

  async function onVote(trackId: string, action: "up" | "down") {
    if (!partyMeta) return;
    const res = await authedFetch(`/api/parties/${partyMeta.id}/votes`, {
      method: "POST",
      body: JSON.stringify({ trackId, action }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { myVote?: 0 | 1 | -1 };
    setMyVotes((prev) => {
      const next = { ...prev };
      if (!data.myVote) delete next[trackId];
      else next[trackId] = data.myVote;
      return next;
    });
  }

  if (!explained) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <HowItWorks
          role="guest"
          continueLabel={`Join party ${code}`}
          onContinue={() => {
            markHowItWorksSeen(GUEST_HOWTO_KEY);
            setHowtoJustDismissed(true);
          }}
        />
      </main>
    );
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

  return (
    <>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-6 pb-20">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/" className="text-sm text-emerald-300/80">
              ← Topspot
            </Link>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
              Party {live.code}
            </h1>
            <p className="text-white/55">Hosted by {live.hostDisplayName}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowQr(true)}
            className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white"
          >
            Invite
          </button>
        </header>

        <HostTransferBanner
          party={live}
          guestId={guestId}
          getIdToken={getIdToken}
        />

        <NowPlayingBar
          key={`${live.nowPlaying?.id ?? "none"}-${live.playbackUpdatedAt}-${live.isPaused}`}
          party={live}
        />

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 font-semibold text-white">Add a track</h2>
          <TrackSearch
            partyId={live.id}
            onAdd={onAdd}
            getIdToken={getIdToken}
            guestId={guestId ?? user?.uid ?? null}
            spotifyLinked={spotifyLinked}
            returnTo={`/p/${live.code}`}
            onSearchingChange={setIsSearching}
          />
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 font-semibold text-white">Queue</h2>
          {realtimeError && (
            <p className="mb-2 text-sm text-amber-200">{realtimeError}</p>
          )}
          <QueueList
            tracks={tracks}
            myVotes={myVotes}
            downvoteMode={live.downvoteMode ?? "off"}
            onVote={onVote}
          />
        </section>
      </main>

      {showQr && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-[#0b1520] p-4 sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-white">Invite guests</h2>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="text-white/60"
              >
                Close
              </button>
            </div>
            <QrCard joinUrl={joinUrl} code={live.code} />
          </div>
        </div>
      )}
    </>
  );
}
