"use client";

type Props = {
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
};

function statusLabel(status?: string, ready?: boolean): string | null {
  if (ready) return null;
  switch (status) {
    case "loading_sdk":
      return "Loading Spotify SDK…";
    case "connecting":
      return "Connecting Spotify player…";
    case "not_ready":
      return "Player went offline — refresh the page";
    case "token_error":
    case "auth_error":
      return "Spotify auth failed — try signing in again";
    case "account_error":
      return "Spotify Premium is required for playback";
    case "init_error":
    case "connect_failed":
    case "error":
      return "Player failed to start — refresh and try again";
    default:
      return "Connecting Spotify player…";
  }
}

function linkCopy(
  deviceLinked: boolean | null,
  activeDeviceName: string | null,
): { title: string; detail: string; tone: "ok" | "warn" | "idle" } {
  if (deviceLinked === null) {
    return {
      title: "Checking link…",
      detail: "Seeing if this browser is Spotify’s active player",
      tone: "idle",
    };
  }
  if (deviceLinked) {
    return {
      title: "Browser linked",
      detail: "Playback is aimed at this tab",
      tone: "ok",
    };
  }
  if (activeDeviceName) {
    return {
      title: "Not linked",
      detail: `Spotify is on “${activeDeviceName}”`,
      tone: "warn",
    };
  }
  return {
    title: "Not linked",
    detail: "No active Spotify device right now",
    tone: "warn",
  };
}

export function HostControls({
  isPaused,
  playerReady,
  busy,
  status,
  deviceLinked,
  activeDeviceName,
  deviceCheckBusy,
  autoLink,
  onPlay,
  onPause,
  onSkip,
  onCheckDevice,
  onLinkDevice,
  onAutoLinkChange,
}: Props) {
  const label = statusLabel(status, playerReady);
  const link = linkCopy(deviceLinked, activeDeviceName);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {label && <p className="text-sm text-amber-200">{label}</p>}
        {isPaused ? (
          <button
            type="button"
            disabled={!playerReady || busy}
            onClick={onPlay}
            className="rounded-full bg-emerald-400 px-6 py-3 font-semibold text-emerald-950 disabled:opacity-50"
          >
            Play
          </button>
        ) : (
          <button
            type="button"
            disabled={!playerReady || busy}
            onClick={onPause}
            className="rounded-full bg-white/15 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            Pause
          </button>
        )}
        <button
          type="button"
          disabled={!playerReady || busy}
          onClick={onSkip}
          className="rounded-full border border-white/20 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      {playerReady && (
        <div className="space-y-2.5 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  link.tone === "ok"
                    ? "bg-emerald-400"
                    : link.tone === "warn"
                      ? "bg-amber-300"
                      : "animate-pulse bg-white/35"
                }`}
                aria-hidden
              />
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    link.tone === "warn" ? "text-amber-100" : "text-white"
                  }`}
                >
                  {link.title}
                </p>
                <p className="truncate text-xs text-white/45">{link.detail}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busy || deviceCheckBusy}
                onClick={onCheckDevice}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/90 transition hover:bg-white/5 disabled:opacity-50"
              >
                {deviceCheckBusy ? "Checking…" : "Check"}
              </button>
              <button
                type="button"
                disabled={busy || deviceCheckBusy || deviceLinked === true}
                onClick={onLinkDevice}
                className="rounded-xl bg-emerald-400/90 px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-40"
              >
                Use this browser
              </button>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoLink}
            onClick={() => onAutoLinkChange(!autoLink)}
            className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-3.5 py-3 text-left transition ${
              autoLink
                ? "border-emerald-400/35 bg-emerald-400/10"
                : "border-white/10 bg-white/3 hover:bg-white/5"
            }`}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">
                Auto-link
              </span>
              <span className="mt-0.5 block text-xs text-white/45">
                {autoLink
                  ? isPaused
                    ? "On — waiting until playback resumes"
                    : "On — will reclaim this browser if Spotify drifts"
                  : "Off — only link when you tap Use this browser"}
              </span>
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                autoLink ? "bg-emerald-400" : "bg-white/20"
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                  autoLink ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
