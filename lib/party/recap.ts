import type { PartyHistoryEntry } from "@/lib/types/party";

export type RecapContributor = {
  guestId: string;
  displayName: string | null;
  trackCount: number;
  tracks: Array<{
    trackId: string;
    name: string;
    artists: string;
    peakUpVoteCount: number;
  }>;
};

export type PartyRecap = {
  topTracks: PartyHistoryEntry[];
  contributors: RecapContributor[];
  totals: {
    tracksPlayed: number;
    playEvents: number;
    uniqueContributors: number;
    totalUpVotes: number;
  };
};

export function buildPartyRecap(
  history: PartyHistoryEntry[],
): PartyRecap {
  const topTracks = [...history].sort((a, b) => {
    if (b.peakUpVoteCount !== a.peakUpVoteCount) {
      return b.peakUpVoteCount - a.peakUpVoteCount;
    }
    if (b.peakVoteCount !== a.peakVoteCount) {
      return b.peakVoteCount - a.peakVoteCount;
    }
    return b.playedAt - a.playedAt;
  });

  const byGuest = new Map<string, RecapContributor>();
  for (const entry of history) {
    if (entry.source === "fallback") continue;
    const key = entry.addedBy || "unknown";
    let row = byGuest.get(key);
    if (!row) {
      row = {
        guestId: key,
        displayName: entry.addedByName,
        trackCount: 0,
        tracks: [],
      };
      byGuest.set(key, row);
    }
    row.trackCount += entry.playCount || 1;
    if (entry.addedByName && !row.displayName) {
      row.displayName = entry.addedByName;
    }
    row.tracks.push({
      trackId: entry.trackId,
      name: entry.name,
      artists: entry.artists,
      peakUpVoteCount: entry.peakUpVoteCount,
    });
  }

  const contributors = [...byGuest.values()].sort(
    (a, b) => b.trackCount - a.trackCount,
  );

  const playEvents = history.reduce((sum, e) => sum + (e.playCount || 1), 0);
  const totalUpVotes = history.reduce(
    (sum, e) => sum + (e.peakUpVoteCount || 0),
    0,
  );

  return {
    topTracks,
    contributors,
    totals: {
      tracksPlayed: history.length,
      playEvents,
      uniqueContributors: contributors.length,
      totalUpVotes,
    },
  };
}
