"use client";

import { LocaleToggle } from "@/components/locale-toggle";
import { CoverArt } from "@/components/party/cover-art";
import { QrCard } from "@/components/party/qr-card";
import { usePartyRealtime } from "@/lib/hooks/use-party-realtime";
import { useT } from "@/lib/i18n/provider";
import { formatDuration } from "@/lib/party/codes";
import { nextQueueTrack, resolvePlaybackPosition } from "@/lib/party/queue";
import type { Party } from "@/lib/types/party";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function DisplayPartyPage() {
  const t = useT();
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();
  const [partyMeta, setPartyMeta] = useState<Party | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/parties/by-code/${code}`);
        const data = (await res.json()) as { party?: Party; error?: string };
        if (!res.ok || !data.party) {
          throw new Error(data.error || "Party not found");
        }
        if (!cancelled) setPartyMeta(data.party);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const {
    party,
    tracks,
    error: realtimeError,
  } = usePartyRealtime(partyMeta?.id ?? null);
  const live = party ?? partyMeta;

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
  const isPaused = live?.isPaused ?? true;
  const playbackUpdatedAt = live?.playbackUpdatedAt ?? 0;
  const basePosition = live?.playbackPositionMs || 0;
  const [nowMs, setNowMs] = useState(playbackUpdatedAt || 0);

  const nowPlayingId = nowPlaying?.id;
  useEffect(() => {
    if (!nowPlayingId || isPaused) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [nowPlayingId, isPaused, playbackUpdatedAt, basePosition]);

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
        <p className="text-2xl font-semibold text-white">{t.display.ended}</p>
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

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
      <div className="absolute right-4 top-4 z-20 sm:right-8 sm:top-6">
        <LocaleToggle />
      </div>
      {nowPlaying?.albumArtUrl && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
          style={{ backgroundImage: `url(${nowPlaying.albumArtUrl})` }}
        />
      )}

      <div className="relative z-10 flex flex-1 flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-12">
        <section className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-200/80">
            {t.display.nowPlayingLabel}
          </p>
          {nowPlaying ? (
            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
              {nowPlaying.albumArtUrl ? (
                <CoverArt
                  src={nowPlaying.albumArtUrl}
                  size={288}
                  className="h-48 w-48 shrink-0 rounded-3xl object-cover shadow-2xl sm:h-56 sm:w-56 lg:h-72 lg:w-72"
                />
              ) : (
                <div className="h-48 w-48 shrink-0 rounded-3xl bg-white/10 sm:h-56 sm:w-56 lg:h-72 lg:w-72" />
              )}
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                  {nowPlaying.source === "fallback"
                    ? t.display.fallback
                    : t.display.request}
                  {isPaused ? ` · ${t.display.paused}` : ""}
                </p>
                <h1 className="mt-2 font-(family-name:--font-display) text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                  {nowPlaying.name}
                </h1>
                <p className="mt-3 truncate text-xl text-white/65 sm:text-2xl">
                  {nowPlaying.artists}
                </p>
                <div className="mt-8 max-w-xl">
                  <div className="h-2 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-linear"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-sm text-white/50">
                    <span>{formatDuration(displayPosition)}</span>
                    <span>{formatDuration(duration)}</span>
                  </div>
                </div>
                {upNext && (
                  <p className="mt-6 text-base text-white/55">
                    {t.display.upNext}{" "}
                    <span className="font-medium text-white/85">
                      {upNext.name}
                    </span>
                    <span className="text-white/45"> · {upNext.artists}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-10">
              <h1 className="font-(family-name:--font-display) text-4xl font-bold text-white sm:text-5xl">
                {t.display.waitingTitle}
              </h1>
              <p className="mt-3 text-lg text-white/55">
                {t.display.waitingSub}
              </p>
            </div>
          )}
        </section>

        <aside className="flex shrink-0 flex-col justify-center lg:w-[min(100%,28rem)]">
          {joinUrl && (
            <QrCard joinUrl={joinUrl} code={live.code} variant="display" />
          )}
        </aside>
      </div>
    </main>
  );
}
