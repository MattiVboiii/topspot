import {
  downvotesEnabled,
  netVoteCount,
  nextQueueTrack,
  resolvePlaybackPosition,
  shouldRemoveForDownvoteThreshold,
  shouldWritePlaybackSync,
  sortPartyQueue,
  usesDownvoteThreshold,
  usesScoreSorting,
} from "@/lib/party/queue";
import type { PartyTrack } from "@/lib/types/party";
import { describe, expect, it } from "vitest";

function track(
  partial: Partial<PartyTrack> &
    Pick<PartyTrack, "id" | "voteCount" | "addedAt">,
): PartyTrack {
  return {
    name: partial.name ?? partial.id,
    artists: partial.artists ?? "Artist",
    albumName: partial.albumName ?? "Album",
    albumArtUrl: partial.albumArtUrl ?? null,
    durationMs: partial.durationMs ?? 180_000,
    uri: partial.uri ?? `spotify:track:${partial.id}`,
    source: partial.source ?? "request",
    upVoteCount: partial.upVoteCount ?? partial.voteCount,
    downVoteCount: partial.downVoteCount ?? 0,
    addedBy: partial.addedBy ?? "guest-1",
    addedByName: partial.addedByName ?? "Guest",
    isPlaying: false,
    ...partial,
  };
}

describe("sortPartyQueue", () => {
  it("orders requests before fallback", () => {
    const sorted = sortPartyQueue([
      track({ id: "f1", source: "fallback", voteCount: 99, addedAt: 1 }),
      track({ id: "r1", source: "request", voteCount: 1, addedAt: 2 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["r1", "f1"]);
  });

  it("sorts by voteCount descending within each section", () => {
    const sorted = sortPartyQueue([
      track({ id: "r-low", source: "request", voteCount: 1, addedAt: 1 }),
      track({ id: "r-high", source: "request", voteCount: 5, addedAt: 2 }),
      track({ id: "f-low", source: "fallback", voteCount: 0, addedAt: 3 }),
      track({ id: "f-high", source: "fallback", voteCount: 2, addedAt: 4 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      "r-high",
      "r-low",
      "f-high",
      "f-low",
    ]);
  });

  it("breaks ties with earlier addedAt (FIFO)", () => {
    const sorted = sortPartyQueue([
      track({ id: "later", source: "request", voteCount: 3, addedAt: 200 }),
      track({ id: "earlier", source: "request", voteCount: 3, addedAt: 100 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["earlier", "later"]);
  });

  it("nextQueueTrack returns the first sorted item", () => {
    const next = nextQueueTrack([
      track({ id: "f1", source: "fallback", voteCount: 10, addedAt: 1 }),
      track({ id: "r1", source: "request", voteCount: 1, addedAt: 2 }),
    ]);
    expect(next?.id).toBe("r1");
  });
});

describe("netVoteCount / downvote modes", () => {
  it("nets up - down when score sorting is on", () => {
    expect(netVoteCount(5, 2, "score")).toBe(3);
    expect(netVoteCount(5, 2, "score_and_threshold")).toBe(3);
  });

  it("uses upvotes only when score sorting is off", () => {
    expect(netVoteCount(5, 2, "off")).toBe(5);
    expect(netVoteCount(5, 2, "threshold")).toBe(5);
  });

  it("classifies modes correctly", () => {
    expect(usesScoreSorting("score")).toBe(true);
    expect(usesScoreSorting("score_and_threshold")).toBe(true);
    expect(usesScoreSorting("threshold")).toBe(false);
    expect(usesScoreSorting("off")).toBe(false);

    expect(usesDownvoteThreshold("threshold")).toBe(true);
    expect(usesDownvoteThreshold("score_and_threshold")).toBe(true);
    expect(usesDownvoteThreshold("score")).toBe(false);
    expect(usesDownvoteThreshold("off")).toBe(false);

    expect(downvotesEnabled("off")).toBe(false);
    expect(downvotesEnabled("score")).toBe(true);
  });
});

describe("shouldRemoveForDownvoteThreshold", () => {
  it("removes when raw down count reaches threshold in threshold modes", () => {
    expect(shouldRemoveForDownvoteThreshold(3, 3, "threshold")).toBe(true);
    expect(shouldRemoveForDownvoteThreshold(3, 3, "score_and_threshold")).toBe(
      true,
    );
    expect(shouldRemoveForDownvoteThreshold(4, 3, "threshold")).toBe(true);
  });

  it("does not remove below threshold or in non-threshold modes", () => {
    expect(shouldRemoveForDownvoteThreshold(2, 3, "threshold")).toBe(false);
    expect(shouldRemoveForDownvoteThreshold(5, 3, "score")).toBe(false);
    expect(shouldRemoveForDownvoteThreshold(5, 3, "off")).toBe(false);
  });

  it("does not remove when threshold is null or undefined", () => {
    expect(shouldRemoveForDownvoteThreshold(10, null, "threshold")).toBe(false);
    expect(shouldRemoveForDownvoteThreshold(10, undefined, "threshold")).toBe(
      false,
    );
  });
});

describe("resolvePlaybackPosition / shouldWritePlaybackSync", () => {
  const baseParty = {
    isPaused: false,
    playbackPositionMs: 10_000,
    playbackUpdatedAt: 1_000_000,
    nowPlaying: {
      id: "t1",
      name: "Song",
      artists: "Artist",
      albumName: "Album",
      albumArtUrl: null,
      durationMs: 180_000,
      uri: "spotify:track:t1",
      source: "request" as const,
      startedAt: 1_000_000,
    },
  };

  it("advances wall-clock while playing and freezes while paused", () => {
    expect(resolvePlaybackPosition(baseParty, { now: 1_005_000 })).toBe(15_000);
    expect(
      resolvePlaybackPosition(
        { ...baseParty, isPaused: true },
        { now: 1_005_000 },
      ),
    ).toBe(10_000);
  });

  it("prefers live SDK position when provided", () => {
    expect(
      resolvePlaybackPosition(baseParty, {
        livePositionMs: 42_000,
        now: 1_005_000,
      }),
    ).toBe(42_000);
  });

  it("writes sync on pause flip or position drift", () => {
    expect(
      shouldWritePlaybackSync(
        baseParty,
        { positionMs: 15_000, isPaused: true },
        1_001_000,
      ),
    ).toBe(true);
    // Wall-clock expected at +1s is 11_000 — within drift threshold.
    expect(
      shouldWritePlaybackSync(
        baseParty,
        { positionMs: 11_000, isPaused: false },
        1_001_000,
      ),
    ).toBe(false);
    expect(
      shouldWritePlaybackSync(
        baseParty,
        { positionMs: 20_000, isPaused: false },
        1_001_000,
      ),
    ).toBe(true);
    // Wall-clock expected at +15s is 25_000 — 100ms drift stays under threshold.
    expect(
      shouldWritePlaybackSync(
        baseParty,
        { positionMs: 25_100, isPaused: false },
        1_015_000,
      ),
    ).toBe(false);
  });
});
