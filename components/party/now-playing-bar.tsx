"use client";

import { CoverArt } from "@/components/party/cover-art";
import { formatDuration } from "@/lib/party/codes";
import { useT } from "@/lib/i18n/provider";
import { resolvePlaybackPosition } from "@/lib/party/queue";
import type { Party } from "@/lib/types/party";
import { useEffect, useState } from "react";

type Props = {
  party: Party;
  /** Controller SDK position — host/controller only */
  livePositionMs?: number | null;
};

export function NowPlayingBar({ party, livePositionMs }: Props) {
  const t = useT();
  const nowPlaying = party.nowPlaying;
  const trackId = nowPlaying?.id ?? null;
  const isPaused = party.isPaused;
  const playbackUpdatedAt = party.playbackUpdatedAt ?? 0;
  const basePosition = party.playbackPositionMs || 0;
  const hasLivePosition = typeof livePositionMs === "number";
  const [nowMs, setNowMs] = useState(playbackUpdatedAt || 0);

  useEffect(() => {
    if (!trackId || isPaused || hasLivePosition) {
      return;
    }
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    const raf = window.requestAnimationFrame(() => {
      setNowMs(Date.now());
    });
    return () => {
      window.clearInterval(id);
      window.cancelAnimationFrame(raf);
    };
  }, [trackId, isPaused, playbackUpdatedAt, basePosition, hasLivePosition]);

  if (!nowPlaying) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl backdrop-saturate-150">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          {t.nowPlaying.label}
        </p>
        <p className="mt-1 text-xl font-semibold text-white">
          {t.nowPlaying.nothingYet}
        </p>
        <p className="text-sm text-white/55">{t.nowPlaying.addAndPlay}</p>
      </section>
    );
  }

  const displayPosition = resolvePlaybackPosition(party, {
    livePositionMs,
    now: hasLivePosition || isPaused ? playbackUpdatedAt : nowMs,
  });
  const duration = Math.max(1, nowPlaying.durationMs || 1);
  const pct = Math.min(100, (displayPosition / duration) * 100);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex items-center gap-3">
        {nowPlaying.albumArtUrl ? (
          <CoverArt
            src={nowPlaying.albumArtUrl}
            size={56}
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-lg bg-white/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">
            {t.nowPlaying.label}
            {nowPlaying.source === "fallback"
              ? ` · ${t.nowPlaying.fallback}`
              : ` · ${t.nowPlaying.request}`}
          </p>
          <p className="truncate text-xl font-semibold text-white">
            {nowPlaying.name}
          </p>
          <p className="truncate text-sm text-white/55">{nowPlaying.artists}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-white/45">
          <span>{formatDuration(displayPosition)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </section>
  );
}
