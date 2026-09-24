"use client";

import { CoverArt } from "@/components/party/cover-art";
import { usePlaybackNow } from "@/lib/hooks/use-playback-now";
import { fill, useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n/types";
import { formatDuration } from "@/lib/party/codes";
import { resolvePlaybackPosition } from "@/lib/party/queue";
import type { Party } from "@/lib/types/party";
import { Pause, Play, SkipForward } from "lucide-react";

type ControllerProps = {
  mode: "controller";
  isPaused: boolean;
  playerReady: boolean;
  busy: boolean;
  status?: string;
  deviceLinked: boolean | null;
  activeDeviceName: string | null;
  deviceCheckBusy: boolean;
  autoLink: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  onCheckDevice: () => void;
  onLinkDevice: () => void;
  onAutoLinkChange: (enabled: boolean) => void;
  error?: string | null;
  showPlayerHint?: boolean;
};

type ReadonlyProps = {
  mode: "readonly";
  readonlyMessage: string;
};

type BaseProps = {
  party: Party;
  livePositionMs?: number | null;
};

type Props = BaseProps & (ControllerProps | ReadonlyProps);

function statusLabel(
  t: Dictionary,
  status?: string,
  ready?: boolean,
): string | null {
  if (ready) return null;
  switch (status) {
    case "loading_sdk":
      return t.player.loadingSdk;
    case "connecting":
      return t.player.connecting;
    case "not_ready":
      return t.player.offline;
    case "token_error":
    case "auth_error":
      return t.player.authFailed;
    case "account_error":
      return t.player.premiumRequired;
    case "init_error":
    case "connect_failed":
    case "error":
      return t.player.failedStart;
    default:
      return t.player.connecting;
  }
}

function linkCopy(
  t: Dictionary,
  deviceLinked: boolean | null,
  activeDeviceName: string | null,
): { title: string; detail: string; tone: "ok" | "warn" | "idle" } {
  if (deviceLinked === null) {
    return {
      title: t.player.checkingLink,
      detail: t.player.checkingLinkHint,
      tone: "idle",
    };
  }
  if (deviceLinked) {
    return {
      title: t.player.browserLinked,
      detail: t.player.aimedAtTab,
      tone: "ok",
    };
  }
  if (activeDeviceName) {
    return {
      title: t.player.notLinked,
      detail: fill(t.player.spotifyOn, { name: activeDeviceName }),
      tone: "warn",
    };
  }
  return {
    title: t.player.notLinked,
    detail: t.player.noActiveDevice,
    tone: "warn",
  };
}

function PlaybackButtons({
  isPaused,
  playerReady,
  busy,
  onPlay,
  onPause,
  onSkip,
  labels,
}: {
  isPaused: boolean;
  playerReady: boolean;
  busy: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  labels: { play: string; pause: string; skip: string };
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {isPaused ? (
        <button
          type="button"
          disabled={!playerReady || busy}
          onClick={onPlay}
          aria-label={labels.play}
          className="flex size-9 items-center justify-center rounded-full bg-emerald-400 text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
        >
          <Play className="size-4 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          disabled={!playerReady || busy}
          onClick={onPause}
          aria-label={labels.pause}
          className="flex size-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 disabled:opacity-50"
        >
          <Pause className="size-4 fill-current" />
        </button>
      )}
      <button
        type="button"
        disabled={!playerReady || busy}
        onClick={onSkip}
        aria-label={labels.skip}
        className="flex size-9 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 disabled:opacity-50"
      >
        <SkipForward className="size-4" />
      </button>
    </div>
  );
}

export function HostPlayerBar(props: Props) {
  const dict = useT();
  const { party, livePositionMs } = props;
  const nowPlaying = party.nowPlaying;
  const trackId = nowPlaying?.id ?? null;
  const isPaused = party.isPaused;
  const playbackUpdatedAt = party.playbackUpdatedAt ?? 0;
  const hasLivePosition = typeof livePositionMs === "number";
  const nowMs = usePlaybackNow({
    active: Boolean(trackId) && !isPaused,
    hasLivePosition,
  });

  const isController = props.mode === "controller";
  const controllerPaused = isController && (props.isPaused || !nowPlaying);
  const statusText = isController
    ? statusLabel(dict, props.status, props.playerReady)
    : null;
  const link =
    isController && props.playerReady
      ? linkCopy(dict, props.deviceLinked, props.activeDeviceName)
      : null;

  if (!nowPlaying) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur-xl backdrop-saturate-150 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">
              {dict.nowPlaying.label}
            </p>
            <p className="mt-0.5 font-semibold text-white">
              {dict.nowPlaying.nothingYet}
            </p>
            <p className="text-xs text-white/55">
              {dict.nowPlaying.addAndPlay}
            </p>
          </div>
          {isController && (
            <PlaybackButtons
              isPaused
              playerReady={props.playerReady}
              busy={props.busy}
              onPlay={props.onPlay}
              onPause={props.onPause}
              onSkip={props.onSkip}
              labels={{
                play: dict.player.play,
                pause: dict.player.pause,
                skip: dict.player.skip,
              }}
            />
          )}
        </div>
        {isController && statusText && (
          <p className="mt-2 text-xs text-amber-200">{statusText}</p>
        )}
        {isController && props.error && (
          <p className="mt-2 text-xs text-amber-200">{props.error}</p>
        )}
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur-xl backdrop-saturate-150 sm:p-4">
      <div className="flex items-center gap-3">
        {nowPlaying.albumArtUrl ? (
          <CoverArt
            src={nowPlaying.albumArtUrl}
            size={48}
            className="h-11 w-11 shrink-0 rounded-md object-cover sm:h-12 sm:w-12"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-md bg-white/10 sm:h-12 sm:w-12" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white sm:text-base">
            {nowPlaying.name}
          </p>
          <p className="truncate text-xs text-white/55">{nowPlaying.artists}</p>
        </div>
        {isController ? (
          <PlaybackButtons
            isPaused={controllerPaused}
            playerReady={props.playerReady}
            busy={props.busy}
            onPlay={props.onPlay}
            onPause={props.onPause}
            onSkip={props.onSkip}
            labels={{
              play: dict.player.play,
              pause: dict.player.pause,
              skip: dict.player.skip,
            }}
          />
        ) : (
          <p className="max-w-36 shrink-0 text-right text-[11px] leading-snug text-white/45">
            {props.readonlyMessage}
          </p>
        )}
      </div>

      <div className="mt-2.5">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] tabular-nums text-white/45">
            {formatDuration(displayPosition)}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/45">
            {formatDuration(duration)}
          </span>
        </div>
      </div>

      {isController && (
        <>
          {statusText && (
            <p className="mt-2 text-xs text-amber-200">{statusText}</p>
          )}

          {props.playerReady && link && (
            <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      link.tone === "ok"
                        ? "bg-emerald-400"
                        : link.tone === "warn"
                          ? "bg-amber-300"
                          : "animate-pulse bg-white/35"
                    }`}
                    aria-hidden
                  />
                  <p className="truncate text-xs text-white/70">
                    <span
                      className={
                        link.tone === "warn"
                          ? "font-semibold text-amber-100"
                          : "font-semibold text-white"
                      }
                    >
                      {link.title}
                    </span>
                    <span className="text-white/45"> · {link.detail}</span>
                  </p>
                </div>
                {link.tone !== "ok" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={props.busy || props.deviceCheckBusy}
                      onClick={props.onCheckDevice}
                      className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/90 transition hover:bg-white/5 disabled:opacity-50"
                    >
                      {props.deviceCheckBusy ? "…" : dict.player.check}
                    </button>
                    <button
                      type="button"
                      disabled={
                        props.busy ||
                        props.deviceCheckBusy ||
                        props.deviceLinked === true
                      }
                      onClick={props.onLinkDevice}
                      className="rounded-lg bg-emerald-400/90 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-40"
                    >
                      {dict.player.useBrowser}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={props.autoLink}
                onClick={() => props.onAutoLinkChange(!props.autoLink)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 px-2.5 py-2 text-left transition hover:bg-white/3"
              >
                <span className="text-xs text-white/70">
                  <span className="font-semibold text-white">
                    {dict.player.autoLink}
                  </span>
                  <span className="text-white/45">
                    {" "}
                    · {props.autoLink ? dict.player.on : dict.player.off}
                  </span>
                </span>
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    props.autoLink ? "bg-emerald-400" : "bg-white/20"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                      props.autoLink ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>
            </div>
          )}

          {props.error && (
            <p className="mt-2 text-xs text-amber-200">{props.error}</p>
          )}
          {props.showPlayerHint && !props.playerReady && !props.error && (
            <p className="mt-2 text-[11px] text-white/45">{dict.player.hint}</p>
          )}
        </>
      )}
    </section>
  );
}
