import { historyEntryFromTrack } from "@/lib/party/playback-control";
import type { PartyTrack } from "@/lib/types/party";
import { describe, expect, it } from "vitest";

describe("historyEntryFromTrack", () => {
  it("increments play count and peaks from previous history", () => {
    const track: PartyTrack = {
      id: "t1",
      name: "Song",
      artists: "Artist",
      albumName: "Album",
      albumArtUrl: null,
      durationMs: 1000,
      uri: "spotify:track:t1",
      source: "request",
      voteCount: 4,
      upVoteCount: 5,
      downVoteCount: 1,
      addedBy: "g1",
      addedByName: "Ada",
      addedAt: 1,
      isPlaying: false,
    };
    const entry = historyEntryFromTrack(track, 100, {
      id: "t1",
      trackId: "t1",
      name: "Song",
      artists: "Artist",
      albumName: "Album",
      albumArtUrl: null,
      durationMs: 1000,
      uri: "spotify:track:t1",
      source: "request",
      upVoteCount: 2,
      downVoteCount: 0,
      voteCount: 2,
      addedBy: "g1",
      addedByName: "Ada",
      playedAt: 50,
      playCount: 2,
      peakUpVoteCount: 3,
      peakVoteCount: 3,
    });
    expect(entry.playCount).toBe(3);
    expect(entry.peakUpVoteCount).toBe(5);
    expect(entry.peakVoteCount).toBe(4);
    expect(entry.playedAt).toBe(100);
  });
});
