import {
  areIncomingTracksValid,
  buildCooldownSet,
  buildPartyTrack,
  collectIncomingTracks,
  countGuestActiveRequests,
  countWouldAddRequests,
  getTrackCooldownMs,
  guestRequestLimitExceeded,
  normalizeTrackSource,
  shouldSkipTrackAdd,
} from "@/lib/party/tracks";
import type { Party, PartyGuest, PartyTrack } from "@/lib/types/party";
import { describe, expect, it } from "vitest";

function party(partial: Partial<Party> = {}): Party {
  return {
    id: "p1",
    code: "ABCD",
    hostSpotifyId: "host",
    hostDisplayName: "Host",
    guestMode: "anonymous",
    createdAt: 0,
    lastActivityAt: 0,
    isActive: true,
    nowPlayingTrackId: null,
    nowPlaying: null,
    isPaused: true,
    deviceId: null,
    playbackPositionMs: 0,
    playbackUpdatedAt: 0,
    playbackStartedAt: null,
    downvoteMode: "off",
    downvoteThreshold: null,
    fallbackPlaylistId: null,
    fallbackPlaylistName: null,
    trackCooldownMinutes: 30,
    maxActiveRequestsPerGuest: 3,
    playbackSpotifyId: "host",
    playbackGuestId: null,
    pendingPlaybackGuestId: null,
    ...partial,
  };
}

describe("normalizeTrackSource", () => {
  it("defaults to request", () => {
    expect(normalizeTrackSource()).toBe("request");
    expect(normalizeTrackSource("fallback")).toBe("fallback");
  });
});

describe("collectIncomingTracks / areIncomingTracksValid", () => {
  it("accepts single or batch payloads", () => {
    const track = {
      id: "t1",
      name: "Song",
      artists: "A",
      albumName: "Alb",
      albumArtUrl: null,
      durationMs: 1,
      uri: "spotify:track:t1",
    };
    expect(collectIncomingTracks({ track })).toEqual([track]);
    expect(collectIncomingTracks({ tracks: [track, track] })).toHaveLength(2);
    expect(areIncomingTracksValid([track])).toBe(true);
    expect(areIncomingTracksValid([{ ...track, uri: "" }])).toBe(false);
  });
});

describe("cooldown and request limits", () => {
  it("builds cooldown set from history", () => {
    const now = 1_000_000;
    const set = buildCooldownSet(
      [
        { id: "a", playedAt: now - 1_000 },
        { id: "b", playedAt: now - 60_000 * 40 },
      ],
      30 * 60_000,
      now,
    );
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(false);
  });

  it("uses party cooldown minutes", () => {
    expect(getTrackCooldownMs(party({ trackCooldownMinutes: 10 }))).toEqual({
      cooldownMinutes: 10,
      cooldownMs: 600_000,
    });
  });

  it("counts active guest requests and would-add", () => {
    const tracks: PartyTrack[] = [
      {
        id: "1",
        name: "a",
        artists: "a",
        albumName: "a",
        albumArtUrl: null,
        durationMs: 1,
        uri: "u1",
        source: "request",
        voteCount: 1,
        upVoteCount: 1,
        downVoteCount: 0,
        addedBy: "g1",
        addedByName: null,
        addedAt: 1,
        isPlaying: false,
      },
      {
        id: "2",
        name: "b",
        artists: "b",
        albumName: "b",
        albumArtUrl: null,
        durationMs: 1,
        uri: "u2",
        source: "fallback",
        voteCount: 0,
        upVoteCount: 0,
        downVoteCount: 0,
        addedBy: "g1",
        addedByName: null,
        addedAt: 2,
        isPlaying: false,
      },
    ];
    expect(countGuestActiveRequests(tracks, "g1")).toBe(1);

    const incoming = [
      {
        id: "3",
        name: "c",
        artists: "c",
        albumName: "c",
        albumArtUrl: null,
        durationMs: 1,
        uri: "u3",
      },
      {
        id: "1",
        name: "a",
        artists: "a",
        albumName: "a",
        albumArtUrl: null,
        durationMs: 1,
        uri: "u1",
      },
    ];
    expect(
      countWouldAddRequests({
        incoming,
        existingIds: new Set(["1"]),
        party: party(),
        onCooldown: new Set(),
      }),
    ).toBe(1);
  });

  it("detects guest request limit", () => {
    expect(
      guestRequestLimitExceeded({
        party: party({ maxActiveRequestsPerGuest: 2 }),
        activeCount: 2,
        wouldAdd: 1,
      }),
    ).toMatchObject({ exceeded: true, maxActive: 2 });
    expect(
      guestRequestLimitExceeded({
        party: party({ maxActiveRequestsPerGuest: 0 }),
        activeCount: 99,
        wouldAdd: 5,
      }),
    ).toEqual({ exceeded: false });
  });
});

describe("shouldSkipTrackAdd / buildPartyTrack", () => {
  it("skips existing or now-playing tracks", () => {
    expect(
      shouldSkipTrackAdd({
        trackId: "x",
        existingIds: new Set(["x"]),
        party: party(),
      }),
    ).toBe(true);
    expect(
      shouldSkipTrackAdd({
        trackId: "np",
        existingIds: new Set(),
        party: party({ nowPlayingTrackId: "np" }),
      }),
    ).toBe(true);
  });

  it("builds a request track with auto-upvote", () => {
    const guest: PartyGuest = {
      id: "g1",
      displayName: "Ada",
      joinedAt: 0,
      spotifyId: null,
      spotifyDisplayName: null,
      isPremium: false,
      lastSeenAt: 0,
      isSearching: false,
    };
    const built = buildPartyTrack({
      item: {
        id: "t1",
        name: "Song",
        artists: "Artist",
        albumName: "Album",
        albumArtUrl: null,
        durationMs: 1000,
        uri: "spotify:track:t1",
      },
      source: "request",
      guestId: "g1",
      guestData: guest,
      addedAt: 42,
    });
    expect(built.voteCount).toBe(1);
    expect(built.upVoteCount).toBe(1);
    expect(built.addedByName).toBe("Ada");
  });
});
