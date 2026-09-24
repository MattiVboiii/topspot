import { describe, expect, it } from "vitest";
import { buildPartyRecap } from "@/lib/party/recap";
import type { PartyHistoryEntry } from "@/lib/types/party";

function entry(
  partial: Partial<PartyHistoryEntry> &
    Pick<PartyHistoryEntry, "id" | "trackId" | "peakUpVoteCount">,
): PartyHistoryEntry {
  return {
    name: partial.name ?? partial.trackId,
    artists: partial.artists ?? "Artist",
    albumName: partial.albumName ?? "Album",
    albumArtUrl: null,
    durationMs: 180_000,
    uri: `spotify:track:${partial.trackId}`,
    source: partial.source ?? "request",
    upVoteCount: partial.upVoteCount ?? partial.peakUpVoteCount,
    downVoteCount: 0,
    voteCount: partial.voteCount ?? partial.peakUpVoteCount,
    addedBy: partial.addedBy ?? "g1",
    addedByName: partial.addedByName ?? "Ada",
    playedAt: partial.playedAt ?? 1,
    playCount: partial.playCount ?? 1,
    peakVoteCount: partial.peakVoteCount ?? partial.peakUpVoteCount,
    ...partial,
  };
}

describe("buildPartyRecap", () => {
  it("ranks by peak upvotes and groups contributors", () => {
    const recap = buildPartyRecap([
      entry({
        id: "a",
        trackId: "a",
        peakUpVoteCount: 2,
        addedBy: "g1",
        addedByName: "Ada",
      }),
      entry({
        id: "b",
        trackId: "b",
        peakUpVoteCount: 5,
        addedBy: "g2",
        addedByName: "Bob",
      }),
      entry({
        id: "c",
        trackId: "c",
        peakUpVoteCount: 1,
        source: "fallback",
        addedBy: "host",
        addedByName: null,
      }),
    ]);

    expect(recap.topTracks.map((t) => t.trackId)).toEqual(["b", "a", "c"]);
    expect(recap.contributors).toHaveLength(2);
    expect(recap.contributors.map((c) => c.displayName).sort()).toEqual([
      "Ada",
      "Bob",
    ]);
    expect(recap.totals.tracksPlayed).toBe(3);
    expect(recap.totals.uniqueContributors).toBe(2);
  });
});
