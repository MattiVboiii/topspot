"use client";

type Props = {
  isPaused: boolean;
  playerReady: boolean;
  busy: boolean;
  status?: string;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
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

export function HostControls({
  isPaused,
  playerReady,
  busy,
  status,
  onPlay,
  onPause,
  onSkip,
}: Props) {
  const label = statusLabel(status, playerReady);

  return (
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
  );
}
