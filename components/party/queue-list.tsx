"use client";

import { formatDuration } from "@/lib/party/codes";
import type { PartyTrack } from "@/lib/types/party";

type Props = {
  tracks: PartyTrack[];
  nowPlayingTrackId: string | null;
  myVotes: Set<string>;
  isHost?: boolean;
  onVote?: (trackId: string, action: "up" | "down") => void;
  onRemove?: (trackId: string) => void;
};

export function QueueList({
  tracks,
  nowPlayingTrackId,
  myVotes,
  isHost,
  onVote,
  onRemove,
}: Props) {
  if (!tracks.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/20 px-4 py-10 text-center text-white/60">
        Queue is empty — search and add the first track.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tracks.map((track, index) => {
        const isPlaying = track.id === nowPlayingTrackId;
        const voted = myVotes.has(track.id);
        return (
          <li
            key={track.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
              isPlaying
                ? "bg-emerald-500/20 ring-1 ring-emerald-400/40"
                : "bg-white/5"
            }`}
          >
            <div className="w-8 shrink-0 text-center font-mono text-sm text-white/50">
              {isPlaying ? "▶" : index + 1}
            </div>
            {track.albumArtUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.albumArtUrl}
                alt=""
                className="h-12 w-12 rounded-md object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-md bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">{track.name}</p>
              <p className="truncate text-sm text-white/60">
                {track.artists}
                {track.addedByName ? ` · ${track.addedByName}` : ""}
              </p>
            </div>
            <span className="hidden text-xs text-white/40 sm:inline">
              {formatDuration(track.durationMs)}
            </span>
            {onVote && (
              <button
                type="button"
                onClick={() => onVote(track.id, voted ? "down" : "up")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  voted
                    ? "bg-emerald-400 text-emerald-950"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
                aria-label={voted ? "Remove vote" : "Vote"}
              >
                ▲ {track.voteCount}
              </button>
            )}
            {!onVote && (
              <span className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white">
                ▲ {track.voteCount}
              </span>
            )}
            {isHost && onRemove && (
              <button
                type="button"
                onClick={() => onRemove(track.id)}
                className="rounded-lg px-2 py-2 text-sm text-red-200 hover:bg-red-500/20"
                aria-label="Remove track"
              >
                ✕
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
