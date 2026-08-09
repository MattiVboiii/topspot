import type {
  DownvoteMode,
  NowPlayingSnapshot,
  Party,
  PartyTrack,
  TrackSource,
} from "@/lib/types/party";

export function trackSource(track: PartyTrack): TrackSource {
  return track.source === "fallback" ? "fallback" : "request";
}

export function compareQueueTracks(a: PartyTrack, b: PartyTrack): number {
  if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
  return a.addedAt - b.addedAt;
}

/** Requests first (by score), then fallback (by score). */
export function sortPartyQueue(tracks: PartyTrack[]): PartyTrack[] {
  const requests = tracks
    .filter((t) => trackSource(t) === "request")
    .sort(compareQueueTracks);
  const fallback = tracks
    .filter((t) => trackSource(t) === "fallback")
    .sort(compareQueueTracks);
  return [...requests, ...fallback];
}

export function nextQueueTrack(tracks: PartyTrack[]): PartyTrack | undefined {
  return sortPartyQueue(tracks)[0];
}

export function toNowPlayingSnapshot(
  track: PartyTrack,
  startedAt = Date.now(),
): NowPlayingSnapshot {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    albumArtUrl: track.albumArtUrl,
    durationMs: track.durationMs,
    uri: track.uri,
    source: trackSource(track),
    startedAt,
  };
}

export function usesScoreSorting(mode: DownvoteMode): boolean {
  return mode === "score" || mode === "score_and_threshold";
}

export function usesDownvoteThreshold(mode: DownvoteMode): boolean {
  return mode === "threshold" || mode === "score_and_threshold";
}

export function downvotesEnabled(mode: DownvoteMode): boolean {
  return mode !== "off";
}

export function netVoteCount(
  up: number,
  down: number,
  mode: DownvoteMode,
): number {
  if (usesScoreSorting(mode)) return up - down;
  return up;
}

/** Guest progress: baseline + wall-clock since last play/resume/pause write. */
export function resolvePlaybackPosition(
  party: Pick<
    Party,
    "isPaused" | "playbackPositionMs" | "playbackUpdatedAt" | "nowPlaying"
  >,
  opts?: { livePositionMs?: number | null; now?: number },
): number {
  if (typeof opts?.livePositionMs === "number" && opts.livePositionMs >= 0) {
    return opts.livePositionMs;
  }
  const base = party.playbackPositionMs || 0;
  if (party.isPaused) return base;
  const now = opts?.now ?? Date.now();
  const updatedAt = party.playbackUpdatedAt || now;
  const duration = party.nowPlaying?.durationMs;
  const position = base + Math.max(0, now - updatedAt);
  if (typeof duration === "number" && duration > 0) {
    return Math.min(duration, position);
  }
  return position;
}

export const GUEST_ONLINE_MS = 75_000;

export function isGuestOnline(
  guest: { lastSeenAt?: number },
  now = Date.now(),
): boolean {
  const seen = guest.lastSeenAt ?? 0;
  return seen > 0 && now - seen < GUEST_ONLINE_MS;
}

export function normalizeParty(raw: Party): Party {
  return {
    ...raw,
    nowPlaying: raw.nowPlaying ?? null,
    playbackPositionMs: raw.playbackPositionMs ?? 0,
    playbackUpdatedAt: raw.playbackUpdatedAt ?? Date.now(),
    playbackStartedAt: raw.playbackStartedAt ?? null,
    downvoteMode: raw.downvoteMode ?? "off",
    downvoteThreshold: raw.downvoteThreshold ?? null,
    fallbackPlaylistId: raw.fallbackPlaylistId ?? null,
    fallbackPlaylistName: raw.fallbackPlaylistName ?? null,
    playbackSpotifyId: raw.playbackSpotifyId || raw.hostSpotifyId,
    playbackGuestId: raw.playbackGuestId ?? null,
    pendingPlaybackGuestId:
      raw.pendingPlaybackGuestId ??
      // legacy field from earlier handoff model
      (raw as Party & { pendingHostTransferGuestId?: string | null })
        .pendingHostTransferGuestId ??
      null,
  };
}

export function normalizeTrack(raw: PartyTrack): PartyTrack {
  const up = raw.upVoteCount ?? raw.voteCount ?? 0;
  const down = raw.downVoteCount ?? 0;
  return {
    ...raw,
    source: raw.source === "fallback" ? "fallback" : "request",
    upVoteCount: up,
    downVoteCount: down,
    voteCount: raw.voteCount ?? up - down,
    isPlaying: false,
  };
}
