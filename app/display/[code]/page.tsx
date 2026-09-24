"use client";

import { LocaleToggle } from "@/components/LocaleToggle";
import { CoverArt } from "@/components/party/CoverArt";
import { DisplayUpvoteToasts } from "@/components/party/DisplayUpvoteToasts";
import { QrCard } from "@/components/party/QrCard";
import { useDisplayUpvoteFeed } from "@/lib/hooks/use-display-upvote-feed";
import { usePartyByCode } from "@/lib/hooks/use-party-by-code";
import { usePartyRealtime } from "@/lib/hooks/use-party-realtime";
import { usePlaybackNow } from "@/lib/hooks/use-playback-now";
import { fill, useT } from "@/lib/i18n/LocaleProvider";
import { formatDuration } from "@/lib/party/codes";
import {
  isGuestOnline,
  nextQueueTrack,
  resolvePlaybackPosition,
} from "@/lib/party/queue";
import type { PartyTrack } from "@/lib/types/party";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

function PlayingEqualizer({ active }: { active: boolean }) {
  if (!active) {
    return (
      <span
        aria-hidden
        className="inline-flex h-3.5 w-5 items-end justify-between gap-0.5 opacity-40"
      >
        <span
          className="w-1 rounded-full bg-emerald-300/80"
          style={{ height: "35%" }}
        />
        <span
          className="w-1 rounded-full bg-emerald-300/80"
          style={{ height: "55%" }}
        />
        <span
          className="w-1 rounded-full bg-emerald-300/80"
          style={{ height: "40%" }}
        />
        <span
          className="w-1 rounded-full bg-emerald-300/80"
          style={{ height: "50%" }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-5 items-end justify-between gap-0.5"
    >
      <span className="display-eq-bar h-full w-1 rounded-full bg-emerald-300" />
      <span className="display-eq-bar h-full w-1 rounded-full bg-emerald-300" />
      <span className="display-eq-bar h-full w-1 rounded-full bg-emerald-300" />
      <span className="display-eq-bar h-full w-1 rounded-full bg-emerald-300" />
    </span>
  );
}

function VoteBadge({
  count,
  bumped,
  size = "md",
}: {
  count: number;
  bumped?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "min-w-14 px-3 py-2 text-base"
      : size === "sm"
        ? "min-w-10 px-2 py-1 text-xs"
        : "min-w-11 px-2.5 py-1.5 text-sm";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-white/8 font-semibold text-white/85 ${sizeClass} ${
        bumped ? "display-vote-bump" : ""
      }`}
    >
      <span aria-hidden>▲</span>
      {count}
    </span>
  );
}

function UpcomingRow({
  tracks,
  bumpedIds,
}: {
  tracks: PartyTrack[];
  bumpedIds: ReadonlySet<string>;
}) {
  const t = useT();
  if (tracks.length === 0) return null;

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-white/40">
        {t.display.comingUp}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {tracks.map((track, index) => {
          const bumped = bumpedIds.has(track.id);
          const votes = track.upVoteCount ?? track.voteCount ?? 0;
          return (
            <li
              key={track.id}
              className={`flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-2 transition-[border-color,background-color] ${
                bumped ? "display-row-flash" : ""
              }`}
            >
              <span className="w-5 shrink-0 text-center font-mono text-sm text-white/35">
                {index + 1}
              </span>
              <CoverArt
                src={track.albumArtUrl}
                size={44}
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-white/90">
                  {track.name}
                </p>
                <p className="truncate text-sm text-white/45">
                  {track.artists}
                </p>
              </div>
              <VoteBadge count={votes} bumped={bumped} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DisplayPartyPage() {
  const t = useT();
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const { partyMeta, loadError } = usePartyByCode(code, { mode: "display" });

  const {
    party,
    tracks,
    guests,
    error: realtimeError,
  } = usePartyRealtime(partyMeta?.id ?? null);
  const live = party ?? partyMeta;
  const { toasts, bumpedIds, dismissToast } = useDisplayUpvoteFeed(tracks);

  const joinUrl = useMemo(() => {
    const partyCode = live?.code || code;
    if (!partyCode) return "";
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "";
    return `${origin}/p/${partyCode}`;
  }, [live?.code, code]);

  const nowPlaying = live?.nowPlaying ?? null;
  const upNext = nextQueueTrack(tracks);
  const upcoming = useMemo(() => {
    const queue = tracks.filter((track) => !track.isPlaying);
    return queue.slice(0, 3);
  }, [tracks]);
  const isPaused = live?.isPaused ?? true;
  const playbackUpdatedAt = live?.playbackUpdatedAt ?? 0;
  const nowPlayingId = nowPlaying?.id;
  const nowPlayingTrack = useMemo(
    () =>
      nowPlayingId
        ? (tracks.find((track) => track.id === nowPlayingId) ?? null)
        : null,
    [tracks, nowPlayingId],
  );
  const nowMs = usePlaybackNow({
    active: Boolean(nowPlayingId) && !isPaused,
  });
  const onlineCount = guests.filter((g) => isGuestOnline(g)).length;
  const nowPlayingVotes =
    nowPlayingTrack?.upVoteCount ?? nowPlayingTrack?.voteCount ?? 0;
  const nowPlayingBumped = nowPlayingId ? bumpedIds.has(nowPlayingId) : false;

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-300">{loadError}</p>
        <Link href="/" className="text-emerald-300 underline">
          {t.common.backHome}
        </Link>
      </main>
    );
  }

  if (!live) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-white/60">
        {realtimeError || t.display.loading}
      </main>
    );
  }

  if (!live.isActive) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-(family-name:--font-display) text-4xl font-bold text-white">
          {t.brand}
        </p>
        <p className="text-2xl font-semibold text-white/80">
          {t.display.ended}
        </p>
        <Link href={`/p/${live.code}`} className="text-emerald-300 underline">
          {t.display.viewRecap}
        </Link>
      </main>
    );
  }

  const displayPosition = resolvePlaybackPosition(live, {
    now: isPaused ? playbackUpdatedAt : nowMs,
  });
  const duration = Math.max(1, nowPlaying?.durationMs || 1);
  const pct = nowPlaying
    ? Math.min(100, (displayPosition / duration) * 100)
    : 0;
  const isLive = Boolean(nowPlaying && !isPaused);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      {nowPlaying?.albumArtUrl ? (
        <>
          <div
            aria-hidden
            className="display-art-drift pointer-events-none absolute inset-[-12%] bg-cover bg-center opacity-70 blur-2xl saturate-150"
            style={{ backgroundImage: `url(${nowPlaying.albumArtUrl})` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,rgba(7,16,24,0.25)_45%,rgba(7,16,24,0.78)_100%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-linear-to-t from-[#071018]/90 via-[#071018]/35 to-[#071018]/20"
          />
        </>
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_30%,rgba(16,185,129,0.18),transparent_55%),radial-gradient(ellipse_60%_40%_at_90%_10%,rgba(14,165,233,0.12),transparent_50%)]"
        />
      )}

      <div className="relative z-10 grid h-full grid-rows-[auto_1fr] gap-6 px-6 py-5 sm:px-10 lg:gap-8 lg:px-12 lg:py-7 xl:px-16">
        <header className="display-fade-up flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-(family-name:--font-display) text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {t.brand}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/50 sm:text-base">
              {live.hostDisplayName ? (
                <span>
                  {fill(t.display.hostedBy, { name: live.hostDisplayName })}
                </span>
              ) : null}
              {onlineCount > 0 ? (
                <>
                  <span className="text-white/25" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-2 text-emerald-200/80">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                      <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    {fill(t.display.liveGuests, { count: onlineCount })}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <LocaleToggle />
        </header>

        <div className="grid min-h-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-center lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
          <section className="display-fade-up flex min-h-0 min-w-0 flex-col justify-center gap-8">
            {nowPlaying ? (
              <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
                <div className="relative mx-auto shrink-0 sm:mx-0">
                  {isLive ? (
                    <div
                      aria-hidden
                      className="display-glow-breathe absolute -inset-5 rounded-[2.25rem] bg-emerald-400/30 blur-2xl"
                    />
                  ) : null}
                  <CoverArt
                    src={nowPlaying.albumArtUrl}
                    size={360}
                    priority
                    className="relative h-44 w-44 rounded-[1.5rem] object-cover shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:h-56 sm:w-56 lg:h-64 lg:w-64 xl:h-72 xl:w-72"
                  />
                </div>

                <div className="min-w-0 flex-1 pb-0.5 text-center sm:text-left">
                  <div className="inline-flex items-center gap-2.5 text-sm uppercase tracking-[0.28em] text-emerald-200/85">
                    <PlayingEqualizer active={isLive} />
                    <span>
                      {t.display.nowPlayingLabel}
                      {isPaused ? ` · ${t.display.paused}` : ""}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <p className="truncate text-sm uppercase tracking-[0.2em] text-white/40">
                      {nowPlaying.source === "fallback"
                        ? t.display.fallback
                        : t.display.request}
                    </p>
                    {nowPlayingVotes > 0 ? (
                      <VoteBadge
                        count={nowPlayingVotes}
                        bumped={nowPlayingBumped}
                        size="sm"
                      />
                    ) : null}
                  </div>
                  <h1 className="mt-2 line-clamp-3 text-balance font-(family-name:--font-display) text-[clamp(1.75rem,4.2vw,3.75rem)] font-bold leading-[1.05] text-white">
                    {nowPlaying.name}
                  </h1>
                  <p className="mt-3 truncate text-[clamp(1.1rem,2vw,1.75rem)] text-white/65">
                    {nowPlaying.artists}
                  </p>

                  <div className="mx-auto mt-6 max-w-xl sm:mx-0">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-emerald-400 to-cyan-300 transition-[width] duration-200 ease-linear"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-sm text-white/45">
                      <span>{formatDuration(displayPosition)}</span>
                      <span>{formatDuration(duration)}</span>
                    </div>
                  </div>

                  {upNext && upcoming.length <= 1 ? (
                    <p className="mt-5 flex flex-wrap items-center justify-center gap-2 truncate text-base text-white/50 sm:justify-start">
                      <span className="uppercase tracking-[0.18em] text-white/35">
                        {t.display.upNext}
                      </span>{" "}
                      <span className="font-medium text-white/85">
                        {upNext.name}
                      </span>
                      <span className="text-white/40"> · {upNext.artists}</span>
                      <VoteBadge
                        count={upNext.upVoteCount ?? upNext.voteCount ?? 0}
                        bumped={bumpedIds.has(upNext.id)}
                        size="sm"
                      />
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl text-center sm:text-left">
                <p className="text-sm uppercase tracking-[0.3em] text-emerald-200/80">
                  {t.brand}
                </p>
                <h1 className="mt-4 text-balance font-(family-name:--font-display) text-[clamp(2rem,5vw,3.75rem)] font-bold text-white">
                  {t.display.waitingTitle}
                </h1>
                <p className="mt-4 text-lg text-white/55 sm:text-xl">
                  {t.display.waitingSub}
                </p>
              </div>
            )}

            {upcoming.length > 1 ? (
              <div className="hidden max-w-xl lg:block">
                <UpcomingRow tracks={upcoming} bumpedIds={bumpedIds} />
              </div>
            ) : null}
          </section>

          <aside className="display-fade-up flex min-h-0 flex-col justify-center gap-5 lg:self-stretch">
            {joinUrl ? (
              <QrCard
                joinUrl={joinUrl}
                code={live.code}
                variant="display"
                hint={t.display.joinHint}
              />
            ) : null}

            {upcoming.length > 1 ? (
              <div className="lg:hidden">
                <UpcomingRow tracks={upcoming} bumpedIds={bumpedIds} />
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <DisplayUpvoteToasts toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
