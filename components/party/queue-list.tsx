"use client";

import { CoverArt } from "@/components/party/cover-art";
import { formatDuration } from "@/lib/party/codes";
import { useT } from "@/lib/i18n/provider";
import { downvotesEnabled } from "@/lib/party/queue";
import type { DownvoteMode, PartyTrack } from "@/lib/types/party";

type Props = {
  tracks: PartyTrack[];
  myVotes: Record<string, 1 | -1>;
  downvoteMode?: DownvoteMode;
  isHost?: boolean;
  onVote?: (trackId: string, action: "up" | "down") => void;
  onRemove?: (trackId: string) => void;
};

function TrackRow({
  track,
  index,
  myVote,
  showDownvote,
  isHost,
  onVote,
  onRemove,
  labels,
}: {
  track: PartyTrack;
  index: number;
  myVote: 1 | -1 | 0;
  showDownvote: boolean;
  isHost?: boolean;
  onVote?: (trackId: string, action: "up" | "down") => void;
  onRemove?: (trackId: string) => void;
  labels: { upvote: string; downvote: string; remove: string };
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-[#0c1824] px-3 py-3">
      <div className="w-8 shrink-0 text-center font-mono text-sm text-white/50">
        {index + 1}
      </div>
      {track.albumArtUrl ? (
        <CoverArt
          src={track.albumArtUrl}
          size={48}
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
      <div className="flex items-center gap-1">
        {onVote ? (
          <button
            type="button"
            onClick={() => onVote(track.id, "up")}
            className={`rounded-lg px-2.5 py-2 text-sm font-semibold transition ${
              myVote === 1
                ? "bg-emerald-400 text-emerald-950"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
            aria-label={labels.upvote}
          >
            ▲ {track.upVoteCount ?? track.voteCount}
          </button>
        ) : (
          <span className="rounded-lg bg-white/10 px-2.5 py-2 text-sm text-white">
            ▲ {track.upVoteCount ?? track.voteCount}
          </span>
        )}
        {showDownvote &&
          (onVote ? (
            <button
              type="button"
              onClick={() => onVote(track.id, "down")}
              className={`rounded-lg px-2.5 py-2 text-sm font-semibold transition ${
                myVote === -1
                  ? "bg-rose-400 text-rose-950"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
              aria-label={labels.downvote}
            >
              ▼ {track.downVoteCount ?? 0}
            </button>
          ) : (
            <span className="rounded-lg bg-white/10 px-2.5 py-2 text-sm text-white">
              ▼ {track.downVoteCount ?? 0}
            </span>
          ))}
      </div>
      {isHost && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(track.id)}
          className="rounded-lg px-2 py-2 text-sm text-red-200 hover:bg-red-500/20"
          aria-label={labels.remove}
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function QueueList({
  tracks,
  myVotes,
  downvoteMode = "off",
  isHost,
  onVote,
  onRemove,
}: Props) {
  const t = useT();
  const showDownvote = downvotesEnabled(downvoteMode);
  const requests = tracks.filter((track) => track.source !== "fallback");
  const fallback = tracks.filter((track) => track.source === "fallback");
  const rowLabels = {
    upvote: t.queue.upvote,
    downvote: t.queue.downvote,
    remove: t.queue.remove,
  };

  if (!tracks.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/20 px-4 py-10 text-center text-white/60">
        {t.queue.empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
          {t.queue.requests}
        </h3>
        {requests.length ? (
          <ul className="flex flex-col gap-2">
            {requests.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                myVote={myVotes[track.id] ?? 0}
                showDownvote={showDownvote}
                isHost={isHost}
                onVote={onVote}
                onRemove={onRemove}
                labels={rowLabels}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-sm text-white/45">
            {t.queue.noRequests}
          </p>
        )}
      </section>

      {(fallback.length > 0 || isHost) && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">
            {t.queue.fallback}
          </h3>
          {fallback.length ? (
            <ul className="flex flex-col gap-2">
              {fallback.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  myVote={myVotes[track.id] ?? 0}
                  showDownvote={showDownvote}
                  isHost={isHost}
                  onVote={onVote}
                  onRemove={onRemove}
                  labels={rowLabels}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-sm text-white/45">
              {t.queue.noFallback}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
