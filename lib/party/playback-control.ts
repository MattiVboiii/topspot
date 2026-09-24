import { getAdminDb } from "@/lib/firebase/admin";
import {
  nextQueueTrack,
  resolvePlaybackPosition,
  shouldWritePlaybackSync,
  toNowPlayingSnapshot,
} from "@/lib/party/queue";
import {
  pausePlayback,
  resumePlayback,
  startPlayback,
} from "@/lib/spotify/api";
import type { Party, PartyHistoryEntry, PartyTrack } from "@/lib/types/party";
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";

export async function getQueueTracks(partyId: string): Promise<PartyTrack[]> {
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("tracks")
    .get();
  return snap.docs.map((doc) => doc.data() as PartyTrack);
}

export async function deleteTrackAndVotes(
  ref: DocumentReference,
  trackId: string,
  batch: WriteBatch,
) {
  batch.delete(ref.collection("tracks").doc(trackId));
  const votes = await ref
    .collection("votes")
    .where("trackId", "==", trackId)
    .get();
  votes.docs.forEach((doc) => batch.delete(doc.ref));
}

export function historyEntryFromTrack(
  track: PartyTrack,
  playedAt: number,
  previous?: PartyHistoryEntry | null,
): PartyHistoryEntry {
  const up = track.upVoteCount ?? 0;
  const down = track.downVoteCount ?? 0;
  const voteCount = track.voteCount ?? up - down;
  return {
    id: track.id,
    trackId: track.id,
    name: track.name,
    artists: track.artists,
    albumName: track.albumName,
    albumArtUrl: track.albumArtUrl,
    durationMs: track.durationMs,
    uri: track.uri,
    source: track.source === "fallback" ? "fallback" : "request",
    upVoteCount: up,
    downVoteCount: down,
    voteCount,
    addedBy: track.addedBy,
    addedByName: track.addedByName,
    playedAt,
    playCount: (previous?.playCount ?? 0) + 1,
    peakUpVoteCount: Math.max(previous?.peakUpVoteCount ?? 0, up),
    peakVoteCount: Math.max(previous?.peakVoteCount ?? 0, voteCount),
  };
}

async function writeHistoryEntry(
  ref: DocumentReference,
  track: PartyTrack,
  playedAt: number,
  batch: WriteBatch,
) {
  const historyRef = ref.collection("history").doc(track.id);
  const existing = await historyRef.get();
  const previous = existing.exists
    ? (existing.data() as PartyHistoryEntry)
    : null;
  batch.set(historyRef, historyEntryFromTrack(track, playedAt, previous));
}

export async function promoteTrackToNowPlaying(opts: {
  ref: DocumentReference;
  track: PartyTrack;
  deviceId: string;
  isPaused?: boolean;
  positionMs?: number;
}) {
  const now = Date.now();
  const snapshot = toNowPlayingSnapshot(opts.track, now);
  const batch = getAdminDb().batch();
  await writeHistoryEntry(opts.ref, opts.track, now, batch);
  await deleteTrackAndVotes(opts.ref, opts.track.id, batch);
  batch.set(
    opts.ref,
    {
      nowPlayingTrackId: opts.track.id,
      nowPlaying: snapshot,
      isPaused: opts.isPaused ?? false,
      deviceId: opts.deviceId,
      playbackPositionMs: opts.positionMs ?? 0,
      playbackUpdatedAt: now,
      playbackStartedAt: now,
      lastActivityAt: now,
    },
    { merge: true },
  );
  await batch.commit();
  return snapshot;
}

export async function syncPlaybackState(opts: {
  party: Party;
  ref: DocumentReference;
  accessToken: string;
  positionMs?: number;
  isPaused?: boolean;
  getPlaybackState: (token: string) => Promise<{
    progressMs: number;
    isPlaying: boolean;
    trackUri: string | null;
  } | null>;
}) {
  if (!opts.party.nowPlaying) {
    return { ok: true as const, synced: false as const };
  }

  let positionMs: number;
  let isPaused: boolean;

  const hasClientSnapshot =
    typeof opts.positionMs === "number" &&
    opts.positionMs >= 0 &&
    typeof opts.isPaused === "boolean";

  if (hasClientSnapshot) {
    positionMs = Math.floor(opts.positionMs!);
    isPaused = opts.isPaused!;
  } else {
    const playback = await opts.getPlaybackState(opts.accessToken);
    if (!playback) {
      return { ok: true as const, synced: false as const };
    }
    if (
      playback.trackUri &&
      opts.party.nowPlaying.uri &&
      playback.trackUri !== opts.party.nowPlaying.uri
    ) {
      return { ok: true as const, synced: false as const };
    }
    positionMs = playback.progressMs;
    isPaused = !playback.isPlaying;
  }

  const duration = opts.party.nowPlaying.durationMs;
  if (typeof duration === "number" && duration > 0) {
    positionMs = Math.min(duration, Math.max(0, positionMs));
  }

  const now = Date.now();
  if (
    !shouldWritePlaybackSync(
      opts.party,
      { positionMs, isPaused },
      now,
    )
  ) {
    return {
      ok: true as const,
      synced: false as const,
      positionMs,
      isPaused,
    };
  }

  await opts.ref.set(
    {
      isPaused,
      playbackPositionMs: positionMs,
      playbackUpdatedAt: now,
    },
    { merge: true },
  );
  return {
    ok: true as const,
    synced: true as const,
    positionMs,
    isPaused,
  };
}

export async function pausePartyPlayback(opts: {
  party: Party;
  ref: DocumentReference;
  accessToken: string;
  deviceId: string;
  positionMs?: number;
}) {
  await pausePlayback(opts.accessToken, opts.deviceId);
  const position =
    typeof opts.positionMs === "number" && opts.positionMs >= 0
      ? Math.floor(opts.positionMs)
      : resolvePlaybackPosition(opts.party);
  await opts.ref.set(
    {
      isPaused: true,
      playbackPositionMs: position,
      playbackUpdatedAt: Date.now(),
      lastActivityAt: Date.now(),
    },
    { merge: true },
  );
}

export async function playPartyPlayback(opts: {
  party: Party;
  ref: DocumentReference;
  partyId: string;
  accessToken: string;
  deviceId: string;
}): Promise<{ trackId: string } | { error: string; status: number }> {
  const { party, ref, partyId, accessToken, deviceId } = opts;

  if (party.nowPlaying && party.isPaused) {
    await resumePlayback(accessToken, deviceId);
    await ref.set(
      {
        isPaused: false,
        deviceId,
        playbackUpdatedAt: Date.now(),
        lastActivityAt: Date.now(),
        playbackPositionMs: party.playbackPositionMs || 0,
      },
      { merge: true },
    );
    return { trackId: party.nowPlaying.id };
  }

  if (party.nowPlaying && !party.isPaused) {
    return { trackId: party.nowPlaying.id };
  }

  const tracks = await getQueueTracks(partyId);
  const next = nextQueueTrack(tracks);
  if (!next) {
    return { error: "Queue is empty", status: 400 };
  }

  await startPlayback(accessToken, deviceId, [next.uri]);
  await promoteTrackToNowPlaying({ ref, track: next, deviceId });
  return { trackId: next.id };
}

export async function skipPartyPlayback(opts: {
  party: Party;
  ref: DocumentReference;
  partyId: string;
  accessToken: string;
  deviceId: string;
}): Promise<{ trackId: string | null }> {
  const { party, ref, partyId, accessToken, deviceId } = opts;
  const tracks = await getQueueTracks(partyId);
  const next = nextQueueTrack(tracks);

  if (party.nowPlayingTrackId) {
    const leftover = await ref
      .collection("tracks")
      .doc(party.nowPlayingTrackId)
      .get();
    if (leftover.exists) {
      const batch = getAdminDb().batch();
      await deleteTrackAndVotes(ref, party.nowPlayingTrackId, batch);
      await batch.commit();
    }
  }

  if (next) {
    await startPlayback(accessToken, deviceId, [next.uri]);
    await promoteTrackToNowPlaying({ ref, track: next, deviceId });
    return { trackId: next.id };
  }

  await pausePlayback(accessToken, deviceId).catch(() => undefined);
  await ref.set(
    {
      nowPlayingTrackId: null,
      nowPlaying: null,
      isPaused: true,
      deviceId,
      playbackPositionMs: 0,
      playbackUpdatedAt: Date.now(),
      playbackStartedAt: null,
      lastActivityAt: Date.now(),
    },
    { merge: true },
  );
  return { trackId: null };
}
