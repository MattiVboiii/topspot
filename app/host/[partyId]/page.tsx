"use client";

import { LocaleToggle } from "@/components/locale-toggle";
import { HostPlayerBar } from "@/components/party/host-player-bar";
import { HostSettingsPanel } from "@/components/party/host-settings-panel";
import {
  HowItWorks,
  markHowItWorksSeen,
  useHowItWorksDismissed,
} from "@/components/party/how-it-works";
import { PartyInvitePanel } from "@/components/party/party-invite-panel";
import { QueueList } from "@/components/party/queue-list";
import { TrackSearch } from "@/components/party/track-search";
import { UpNextBanner } from "@/components/party/up-next-banner";
import { useGuestAuth } from "@/lib/hooks/use-guest-auth";
import { useGuestPresence } from "@/lib/hooks/use-guest-presence";
import { usePartyRealtime } from "@/lib/hooks/use-party-realtime";
import { useSpotifyPlayer } from "@/lib/hooks/use-spotify-player";
import { fill, useT } from "@/lib/i18n/provider";
import { isGuestOnline, nextQueueTrack } from "@/lib/party/queue";
import type { SpotifySearchTrack } from "@/lib/types/party";
import { QrCodeIcon, SettingsIcon, TvIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const HOST_HOWTO_KEY = "topspot_host_howto_v1";
const AUTO_LINK_KEY = "topspot_auto_link_device";

export default function HostPartyPage() {
  const t = useT();
  const params = useParams<{ partyId: string }>();
  const partyId = params.partyId;
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "in" | "out">(
    "loading",
  );
  const [sessionSpotifyId, setSessionSpotifyId] = useState<string | null>(null);
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
    authState === "in" && Boolean(partyId) && !showExplainer && isController;
  const {
    deviceId: browserDeviceId,
    ready: playerReady,
    error: playerError,
    status: playerStatus,
    positionMs,
    isActiveDevice: sdkActiveDevice,
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
  const [autoLink, setAutoLink] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(AUTO_LINK_KEY) === "1";
    } catch {
      return false;
    }
  });
  const linkingRef = useRef(false);
  const autoLinkRef = useRef(false);
  const sdkActiveDeviceRef = useRef(false);
  const partyPausedRef = useRef(true);
  const linkBrowserDeviceRef = useRef<
    (opts?: { silent?: boolean }) => Promise<void>
  >(async () => {});

  useEffect(() => {
    autoLinkRef.current = autoLink;
  }, [autoLink]);

  useEffect(() => {
    sdkActiveDeviceRef.current = sdkActiveDevice;
  }, [sdkActiveDevice]);

  useEffect(() => {
    partyPausedRef.current = Boolean(party?.isPaused || !party?.nowPlaying);
  }, [party?.isPaused, party?.nowPlaying]);

  useEffect(() => {
    if (party && party.isActive === false) {
      router.replace(`/host/${partyId}/recap`);
    }
  }, [party, partyId, router]);

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

  useLayoutEffect(() => {
    const previous = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      try {
        previous?.();
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("spotify-sdk-ready"));
    };
    if (window.Spotify) {
      window.dispatchEvent(new Event("spotify-sdk-ready"));
    }
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
        const linked = Boolean(data.linked) || sdkActiveDeviceRef.current;
        setDeviceLinked(linked);
        setActiveDeviceName(
          linked
            ? (data.activeDeviceName ?? t.player.deviceName)
            : (data.activeDeviceName ?? null),
        );

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
    [browserDeviceId, partyId, t.player.deviceName],
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
        setActiveDeviceName(t.player.deviceName);
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
    [browserDeviceId, partyId, checkDeviceLink, t.player.deviceName],
  );

  useEffect(() => {
    linkBrowserDeviceRef.current = linkBrowserDevice;
  }, [linkBrowserDevice]);

  const canControlDevice =
    playerReady && Boolean(browserDeviceId) && isController;
  const deviceLinkedForUi = canControlDevice
    ? deviceLinked === true || sdkActiveDevice
      ? true
      : deviceLinked
    : null;
  const activeDeviceNameForUi = canControlDevice
    ? deviceLinkedForUi
      ? (activeDeviceName ?? t.player.deviceName)
      : activeDeviceName
    : null;

  const playerConnecting =
    !playerReady ||
    playerStatus === "connecting" ||
    playerStatus === "loading_sdk";
  const [linkGate, setLinkGate] = useState({
    connecting: playerConnecting,
    controlling: canControlDevice,
  });
  if (
    linkGate.connecting !== playerConnecting ||
    linkGate.controlling !== canControlDevice
  ) {
    const gainedControl =
      canControlDevice && !linkGate.controlling && !playerConnecting;
    setLinkGate({
      connecting: playerConnecting,
      controlling: canControlDevice,
    });
    if (playerConnecting || gainedControl) {
      setDeviceLinked(null);
      setActiveDeviceName(null);
    }
  }

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
    if (!canControlDevice) return;
    const kickoff = window.setTimeout(() => {
      void checkDeviceLink();
    }, 0);
    const id = window.setInterval(() => void checkDeviceLink(), 20_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [canControlDevice, checkDeviceLink]);

  // When playback resumes, immediately auto-link if needed.
  useEffect(() => {
    if (!autoLink || !canControlDevice) return;
    if (party?.isPaused || !party?.nowPlaying) return;
    if (deviceLinked !== false) return;
    const timer = window.setTimeout(() => {
      void linkBrowserDeviceRef.current({ silent: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    autoLink,
    canControlDevice,
    party?.isPaused,
    party?.nowPlaying,
    deviceLinked,
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
        {t.common.loading}
      </main>
    );
  }

  if (authState === "out") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-white/70">{t.host.signInPrompt}</p>
        <a
          href={`/api/auth/spotify?intent=host&returnTo=${encodeURIComponent(`/host/${partyId}`)}`}
          className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
        >
          {t.common.signInSpotify}
        </a>
      </main>
    );
  }

  if (showExplainer) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <HowItWorks
          role="host"
          continueLabel={t.host.openDashboard}
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
        {realtimeError || guestError || t.common.loading}
      </main>
    );
  }

  if (!isOwner && !isController) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-white/70">{t.host.wrongAccount}</p>
        <Link href="/" className="text-emerald-300 underline">
          {t.common.backHome}
        </Link>
      </main>
    );
  }

  const controllerLabel = guests.find((g) => g.id === party.playbackGuestId);
  const myNextTrack =
    guestId && party.nowPlaying
      ? (() => {
          const next = nextQueueTrack(tracks);
          return next?.addedBy === guestId ? next : null;
        })()
      : null;

  return (
    <>
      <Script
        src="https://sdk.scdn.co/spotify-player.js"
        strategy="afterInteractive"
        onReady={() => {
          if (window.Spotify) {
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
              {isOwner ? t.host.roleHost : t.host.roleMusic} · {party.code}
            </h1>
            <p className="truncate text-sm text-white/60">
              {isOwner
                ? fill(t.host.ownedBy, { name: party.hostDisplayName })
                : fill(t.host.playingFor, { name: party.hostDisplayName })}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <LocaleToggle />
            <a
              href={`/display/${party.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white"
              title={t.host.openTv}
            >
              <TvIcon className="size-4" />
            </a>
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white"
            >
              <QrCodeIcon className="size-4" />
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white"
              >
                <SettingsIcon className="size-4" />
              </button>
            )}
          </div>
        </header>

        {isOwner && !isController && (
          <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-100">
              {fill(t.host.musicWith, {
                name:
                  controllerLabel?.spotifyDisplayName ||
                  controllerLabel?.displayName ||
                  t.common.guest,
              })}
            </p>
            <p className="mt-1 text-sm text-amber-100/80">{t.host.stillOwn}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void reclaimControl()}
              className="mt-3 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
            >
              {t.host.takeMusicBack}
            </button>
          </section>
        )}

        <div className="sticky top-0 z-20 -mx-4 overflow-hidden border-y border-white/10 bg-white/[0.06] backdrop-blur-xl backdrop-saturate-150 sm:mx-0 sm:rounded-2xl sm:border">
          {myNextTrack && <UpNextBanner trackName={myNextTrack.name} />}
          <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:backdrop-blur-none">
            {isController ? (
              <HostPlayerBar
                key={`${party.nowPlaying?.id ?? "none"}-${party.playbackUpdatedAt}-${party.isPaused}`}
                mode="controller"
                party={party}
                livePositionMs={playerReady ? positionMs : null}
                isPaused={party.isPaused || !party.nowPlaying}
                playerReady={playerReady}
                busy={busy}
                status={playerStatus}
                deviceLinked={deviceLinkedForUi}
                activeDeviceName={activeDeviceNameForUi}
                deviceCheckBusy={deviceCheckBusy}
                autoLink={autoLink}
                onPlay={() => void control("play")}
                onPause={() => void control("pause")}
                onSkip={() => void control("skip")}
                onCheckDevice={() => void checkDeviceLink({ manual: true })}
                onLinkDevice={() => void linkBrowserDevice()}
                onAutoLinkChange={onAutoLinkChange}
                error={actionError || playerError}
                showPlayerHint
              />
            ) : (
              <HostPlayerBar
                key={`${party.nowPlaying?.id ?? "none"}-${party.playbackUpdatedAt}-${party.isPaused}`}
                mode="readonly"
                party={party}
                readonlyMessage={t.player.controlsElsewhere}
              />
            )}
          </div>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-lg font-semibold text-white">
            {t.host.addTracks}
          </h2>
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
            <h2 className="text-lg font-semibold text-white">
              {t.queue.title}
            </h2>
            <p className="text-xs text-white/45">
              {fill(t.queue.onlineJoined, {
                online: onlineGuests.length,
                joined: guests.length,
              })}
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
          key={`${party.guestMode}-${party.downvoteMode}-${party.downvoteThreshold}-${party.trackCooldownMinutes}-${party.maxActiveRequestsPerGuest}`}
          party={party}
          partyId={partyId}
          guests={guests}
          getIdToken={getIdToken}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {showQr && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
          <div className="flex max-h-[min(92dvh,100%)] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b1520] sm:max-h-[min(88dvh,720px)] sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 className="font-semibold text-white">
                {t.common.inviteGuests}
              </h2>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="text-white/60"
              >
                {t.common.close}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <PartyInvitePanel
                joinUrl={joinUrl}
                code={party.code}
                hostName={party.hostDisplayName}
                partyId={partyId}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
