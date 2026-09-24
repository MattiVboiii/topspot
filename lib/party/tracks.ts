import type {
  Party,
  PartyGuest,
  PartyTrack,
  SpotifySearchTrack,
  TrackSource,
} from "@/lib/types/party";

export function normalizeTrackSource(source?: TrackSource): TrackSource {
  return source === "fallback" ? "fallback" : "request";
}

export function collectIncomingTracks(body: {
  track?: SpotifySearchTrack;
  tracks?: SpotifySearchTrack[];
}): SpotifySearchTrack[] {
  if (body.tracks?.length) return body.tracks;
  if (body.track) return [body.track];
  return [];
}

export function areIncomingTracksValid(tracks: SpotifySearchTrack[]): boolean {
  return tracks.length > 0 && tracks.every((t) => Boolean(t?.id && t?.uri));
}

export function getTrackCooldownMs(party: Party): {
  cooldownMinutes: number;
  cooldownMs: number;
} {
  const cooldownMinutes =
    typeof party.trackCooldownMinutes === "number"
      ? party.trackCooldownMinutes
      : 30;
  return {
    cooldownMinutes,
    cooldownMs: Math.max(0, cooldownMinutes) * 60_000,
  };
}

export function buildCooldownSet(
  historyEntries: Array<{ id: string; playedAt?: number }>,
  cooldownMs: number,
  now = Date.now(),
): Set<string> {
  const onCooldown = new Set<string>();
  if (cooldownMs <= 0) return onCooldown;
  for (const entry of historyEntries) {
    if (now - (entry.playedAt ?? 0) < cooldownMs) {
      onCooldown.add(entry.id);
    }
  }
  return onCooldown;
}

export function countGuestActiveRequests(
  tracks: PartyTrack[],
  guestId: string,
): number {
  return tracks.filter((t) => {
    return (t.source === "request" || !t.source) && t.addedBy === guestId;
  }).length;
}

export function countWouldAddRequests(opts: {
  incoming: SpotifySearchTrack[];
  existingIds: Set<string>;
  party: Party;
  onCooldown: Set<string>;
}): number {
  return opts.incoming.filter(
    (item) =>
      !opts.existingIds.has(item.id) &&
      opts.party.nowPlaying?.id !== item.id &&
      opts.party.nowPlayingTrackId !== item.id &&
      !opts.onCooldown.has(item.id),
  ).length;
}

export function guestRequestLimitExceeded(opts: {
  party: Party;
  activeCount: number;
  wouldAdd: number;
}):
  | { exceeded: false }
  | {
      exceeded: true;
      maxActive: number;
      activeCount: number;
    } {
  const maxActive =
    typeof opts.party.maxActiveRequestsPerGuest === "number"
      ? opts.party.maxActiveRequestsPerGuest
      : 3;
  if (maxActive <= 0) return { exceeded: false };
  if (opts.activeCount + opts.wouldAdd > maxActive) {
    return {
      exceeded: true,
      maxActive,
      activeCount: opts.activeCount,
    };
  }
  return { exceeded: false };
}

export function shouldSkipTrackAdd(opts: {
  trackId: string;
  existingIds: Set<string>;
  party: Party;
}): boolean {
  return (
    opts.existingIds.has(opts.trackId) ||
    opts.party.nowPlaying?.id === opts.trackId ||
    opts.party.nowPlayingTrackId === opts.trackId
  );
}

export function buildPartyTrack(opts: {
  item: SpotifySearchTrack;
  source: TrackSource;
  guestId: string;
  guestData: PartyGuest;
  addedAt: number;
}): PartyTrack {
  const { item, source, guestId, guestData, addedAt } = opts;
  return {
    id: item.id,
    name: item.name,
    artists: item.artists,
    albumName: item.albumName,
    albumArtUrl: item.albumArtUrl,
    durationMs: item.durationMs,
    uri: item.uri,
    source,
    voteCount: source === "request" ? 1 : 0,
    upVoteCount: source === "request" ? 1 : 0,
    downVoteCount: 0,
    addedBy: guestId,
    addedByName: guestData.displayName,
    addedAt,
    isPlaying: false,
  };
}
