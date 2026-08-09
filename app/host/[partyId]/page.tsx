"use client";

import { HostControls } from "@/components/party/host-controls";
import { HostSettingsPanel } from "@/components/party/host-settings-panel";
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
import { useSpotifyPlayer } from "@/lib/hooks/use-spotify-player";
import { isGuestOnline } from "@/lib/party/queue";
import type { SpotifySearchTrack } from "@/lib/types/party";
import Link from "next/link";
import { useParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const HOST_HOWTO_KEY = "topspot_host_howto_v1";
const AUTO_LINK_KEY = "topspot_auto_link_device";

export default function HostPartyPage() {
  const params = useParams<{ partyId: string }>();
  const partyId = params.partyId;
  const [authState, setAuthState] = useState<"loading" | "in" | "out">(
    "loading",
  );
  const [sessionSpotifyId, setSessionSpotifyId] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const howtoSeen = useHowItWorksDismissed(HOST_HOWTO_KEY);
  const [howtoJustDismissed, setHowtoJustDismissed] = useState(false);
  const showExplainer = !howtoSeen && !howtoJustDismissed;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const {
    party,
    tracks,
    guests,
    error: realtimeError,
  } = usePartyRealtime(partyId);
  const { ready: guestReady, getIdToken, error: guestError } = useGuestAuth();
  const isOwner = Boolean(
    party && sessionSpotifyId && party.hostSpotifyId === sessionSpotifyId,
  );
  const isController = Boolean(
    party &&
    sessionSpotifyId &&
    (party.playbackSpotifyId || party.hostSpotifyId) === sessionSpotifyId,
  );
  // Keep SDK enablement stable so progress Firestore ticks don't recreate the player.
  const playerEnabled =
    authState === "in" &&
    Boolean(partyId) &&
    sdkReady &&
    !showExplainer &&
    isController;
  const {
    deviceId: browserDeviceId,
    ready: playerReady,
    error: playerError,
    status: playerStatus,
    positionMs,
  } = useSpotifyPlayer(playerEnabled, partyId);

  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [guestId, setGuestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [, setPresenceTick] = useState(0);
  const [deviceLinked, setDeviceLinked] = useState<boolean | null>(null);
  const [activeDeviceName, setActiveDeviceName] = useState<string | null>(null);
  const [deviceCheckBusy, setDeviceCheckBusy] = useState(false);
  const [autoLink, setAutoLink] = useState(false);
  const linkingRef = useRef(false);
  const autoLinkRef = useRef(false);
  const partyPausedRef = useRef(true);
  const linkBrowserDeviceRef = useRef<
    (opts?: { silent?: boolean }) => Promise<void>
  >(async () => {});

  useEffect(() => {
    try {
      setAutoLink(window.localStorage.getItem(AUTO_LINK_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    autoLinkRef.current = autoLink;
  }, [autoLink]);

  useEffect(() => {
    partyPausedRef.current = Boolean(party?.isPaused || !party?.nowPlaying);
  }, [party?.isPaused, party?.nowPlaying]);

  useGuestPresence({
    partyId,
    enabled: authState === "in" && Boolean(guestId) && !showExplainer,
    isSearching,
    getIdToken,
  });

  useEffect(() => {
    const id = window.setInterval(() => setPresenceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const onlineGuests = guests.filter((g) => isGuestOnline(g));

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
      .then((data: { authenticated?: boolean; spotifyId?: string }) => {
        if (cancelled) return;
        setAuthState(data.authenticated ? "in" : "out");
        setSessionSpotifyId(data.spotifyId ?? null);
      })
      .catch(() => {
        if (!cancelled) setAuthState("out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const partyCode = party?.code;
  const hostDisplayName = party?.hostDisplayName;
  const joinedRef = useRef(false);

  useEffect(() => {
    if (
      !partyCode ||
      !hostDisplayName ||
      authState !== "in" ||
      showExplainer ||
      !guestReady ||
      joinedRef.current
    ) {
      return;
    }
    let cancelled = false;
    async function ensureHostGuest() {
      try {
        const token = await getIdToken();
        const joinRes = await fetch(`/api/parties/by-code/${partyCode}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: hostDisplayName,
          }),
        });
        if (cancelled) return;
        if (joinRes.ok) {
          joinedRef.current = true;
          const data = (await joinRes.json()) as { guestId?: string };
          if (data.guestId) setGuestId(data.guestId);
        }
        const votesRes = await fetch(`/api/parties/${partyId}/votes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !votesRes.ok) return;
        const data = (await votesRes.json()) as {
          votes?: Record<string, 1 | -1>;
        };
        setMyVotes(data.votes ?? {});
      } catch {
        // retry on next dependency change
      }
    }
    void ensureHostGuest();
    return () => {
      cancelled = true;
    };
  }, [
    partyCode,
    hostDisplayName,
    authState,
    guestReady,
    getIdToken,
    partyId,
    showExplainer,
  ]);

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
        body: JSON.stringify({
          action,
          ...(action === "pause" ? { positionMs } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Control failed");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Control failed");
    } finally {
      setBusy(false);
    }
  }

  const checkDeviceLink = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!browserDeviceId) {
        setDeviceLinked(null);
        setActiveDeviceName(null);
        return;
      }
      if (opts?.manual) {
        setDeviceCheckBusy(true);
        setActionError(null);
      }
      try {
        const res = await fetch(`/api/parties/${partyId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "device-status",
            deviceId: browserDeviceId,
          }),
        });
        const data = (await res.json()) as {
          linked?: boolean;
          activeDeviceName?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not check device");
        const linked = Boolean(data.linked);
        setDeviceLinked(linked);
        setActiveDeviceName(data.activeDeviceName ?? null);

        // Auto-link only while party playback is active (not paused / no track).
        if (
          !linked &&
          autoLinkRef.current &&
          !partyPausedRef.current &&
          !linkingRef.current
        ) {
          void linkBrowserDeviceRef.current({ silent: true });
        }
      } catch (err) {
        if (opts?.manual) {
          setActionError(
            err instanceof Error ? err.message : "Could not check device",
          );
        }
      } finally {
        if (opts?.manual) setDeviceCheckBusy(false);
      }
    },
    [browserDeviceId, partyId],
  );

  const linkBrowserDevice = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!browserDeviceId || linkingRef.current) return;
      linkingRef.current = true;
      if (!opts?.silent) {
        setBusy(true);
        setActionError(null);
      }
      try {
        const res = await fetch(`/api/parties/${partyId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "link-device",
            deviceId: browserDeviceId,
          }),
        });
        const data = (await res.json()) as {
          linked?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not link browser");
        setDeviceLinked(true);
        setActiveDeviceName("TopSpot Party Player");
        if (!opts?.silent) await checkDeviceLink();
      } catch (err) {
        if (!opts?.silent) {
          setActionError(
            err instanceof Error ? err.message : "Could not link browser",
          );
        }
      } finally {
        linkingRef.current = false;
        if (!opts?.silent) setBusy(false);
      }
    },
    [browserDeviceId, partyId, checkDeviceLink],
  );

  linkBrowserDeviceRef.current = linkBrowserDevice;

  function onAutoLinkChange(enabled: boolean) {
    setAutoLink(enabled);
    autoLinkRef.current = enabled;
    try {
      window.localStorage.setItem(AUTO_LINK_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
    if (enabled && deviceLinked === false && !partyPausedRef.current) {
      void linkBrowserDevice({ silent: true });
    }
  }

  useEffect(() => {
    if (!playerReady || !browserDeviceId || !isController) {
      setDeviceLinked(null);
      setActiveDeviceName(null);
      return;
    }
    void checkDeviceLink();
    const id = window.setInterval(() => void checkDeviceLink(), 20_000);
    return () => window.clearInterval(id);
  }, [playerReady, browserDeviceId, isController, checkDeviceLink]);

  // When playback resumes, immediately auto-link if needed.
  useEffect(() => {
    if (!autoLink || !playerReady || !browserDeviceId || !isController) return;
    if (party?.isPaused || !party?.nowPlaying) return;
    if (deviceLinked !== false) return;
    void linkBrowserDevice({ silent: true });
  }, [
    autoLink,
    playerReady,
    browserDeviceId,
    isController,
    party?.isPaused,
    party?.nowPlaying,
    deviceLinked,
    linkBrowserDevice,
  ]);

  async function onAdd(track: SpotifySearchTrack) {
    const res = await authedFetch(`/api/parties/${partyId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track, source: "request" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Could not add track");
    setMyVotes((prev) => ({ ...prev, [track.id]: 1 }));
  }

  async function onVote(trackId: string, action: "up" | "down") {
    const res = await authedFetch(`/api/parties/${partyId}/votes`, {
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

  async function onRemove(trackId: string) {
    await fetch(
      `/api/parties/${partyId}/tracks?trackId=${encodeURIComponent(trackId)}`,
      { method: "DELETE" },
    );
  }

  async function reclaimControl() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reclaim" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not reclaim control");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not reclaim control",
      );
    } finally {
      setBusy(false);
    }
  }

  if (authState === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-white/60">
        Loading…
      </main>
    );
  }

  if (authState === "out") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-white/70">
          Sign in as the host to control this party.
        </p>
        <a
          href={`/api/auth/spotify?intent=host&returnTo=${encodeURIComponent(`/host/${partyId}`)}`}
          className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
        >
          Sign in with Spotify
        </a>
      </main>
    );
  }

  if (showExplainer) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <HowItWorks
          role="host"
          continueLabel="Open host dashboard"
          onContinue={() => {
            markHowItWorksSeen(HOST_HOWTO_KEY);
            setHowtoJustDismissed(true);
          }}
        />
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

  if (!isOwner && !isController) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-white/70">
          You&apos;re signed in, but this party belongs to another Spotify
          account. Join with the party code as a guest, or sign in as the owner.
        </p>
        <Link href="/" className="text-emerald-300 underline">
          Back home
        </Link>
      </main>
    );
  }

  const controllerLabel = guests.find((g) => g.id === party.playbackGuestId);

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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 pb-24 sm:px-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/"
              className="text-sm text-emerald-300/80 hover:underline"
            >
              ← TopSpot
            </Link>
            <h1 className="mt-2 font-(family-name:--font-display) text-2xl font-bold text-white sm:text-3xl">
              {isOwner ? "Host" : "Music control"} · {party.code}
            </h1>
            <p className="truncate text-sm text-white/60">
              {isOwner
                ? `Owned by ${party.hostDisplayName}`
                : `Playing for ${party.hostDisplayName}'s party`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white"
            >
              QR
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white"
              >
                Settings
              </button>
            )}
          </div>
        </header>

        {isOwner && !isController && (
          <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-100">
              Music control is with{" "}
              {controllerLabel?.spotifyDisplayName ||
                controllerLabel?.displayName ||
                "a guest"}
            </p>
            <p className="mt-1 text-sm text-amber-100/80">
              You still own this party and can change settings anytime.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reclaimControl()}
              className="mt-3 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
            >
              Take music control back
            </button>
          </section>
        )}

        <NowPlayingBar
          key={`${party.nowPlaying?.id ?? "none"}-${party.playbackUpdatedAt}-${party.isPaused}`}
          party={party}
          livePositionMs={isController && playerReady ? positionMs : null}
        />

        {isController ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <HostControls
              isPaused={party.isPaused || !party.nowPlaying}
              playerReady={playerReady}
              busy={busy}
              status={sdkReady ? playerStatus : "loading_sdk"}
              deviceLinked={deviceLinked}
              activeDeviceName={activeDeviceName}
              deviceCheckBusy={deviceCheckBusy}
              autoLink={autoLink}
              onPlay={() => void control("play")}
              onPause={() => void control("pause")}
              onSkip={() => void control("skip")}
              onCheckDevice={() => void checkDeviceLink({ manual: true })}
              onLinkDevice={() => void linkBrowserDevice()}
              onAutoLinkChange={onAutoLinkChange}
            />
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
        ) : (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            Playback controls are on the guest&apos;s device until you take
            control back.
          </p>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">Add tracks</h2>
          <TrackSearch
            partyId={partyId}
            onAdd={onAdd}
            getIdToken={getIdToken}
            guestId={guestId}
            spotifyLinked
            returnTo={`/host/${partyId}`}
            onSearchingChange={setIsSearching}
          />
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Queue</h2>
            <p className="text-xs text-white/45">
              {onlineGuests.length} online · {guests.length} joined
            </p>
          </div>
          <QueueList
            tracks={tracks}
            myVotes={myVotes}
            downvoteMode={party.downvoteMode ?? "off"}
            isHost={isOwner}
            onVote={onVote}
            onRemove={isOwner ? onRemove : undefined}
          />
        </section>
      </main>

      {settingsOpen && isOwner && (
        <HostSettingsPanel
          key={`${party.guestMode}-${party.downvoteMode}-${party.downvoteThreshold}`}
          party={party}
          partyId={partyId}
          guests={guests}
          getIdToken={getIdToken}
          onClose={() => setSettingsOpen(false)}
        />
      )}

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
            <QrCard joinUrl={joinUrl} code={party.code} />
          </div>
        </div>
      )}
    </>
  );
}
