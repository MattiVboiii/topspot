import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { isPlaybackController } from "@/lib/party/ownership";
import {
  nextQueueTrack,
  resolvePlaybackPosition,
  shouldWritePlaybackSync,
  toNowPlayingSnapshot,
} from "@/lib/party/queue";
import {
  getPlaybackState,
  getPlayerDevices,
  pausePlayback,
  resumePlayback,
  startPlayback,
  transferPlayback,
} from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party, PartyHistoryEntry, PartyTrack } from "@/lib/types/party";
import type { DocumentReference, WriteBatch } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

async function requirePlaybackParty(partyId: string, spotifyId: string) {
  const ref = getAdminDb().collection("parties").doc(partyId);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      error: NextResponse.json({ error: "Party not found" }, { status: 404 }),
    } as const;
  }
  const party = snap.data() as Party;
  if (!isPlaybackController(party, spotifyId)) {
    return {
      error: NextResponse.json(
        { error: "Only the current music controller can do that" },
        { status: 403 },
      ),
    } as const;
  }
  return { party, ref } as const;
}

async function getQueueTracks(partyId: string): Promise<PartyTrack[]> {
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("tracks")
    .get();
  return snap.docs.map((doc) => doc.data() as PartyTrack);
}

async function deleteTrackAndVotes(
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

function historyEntryFromTrack(
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

async function promoteTrackToNowPlaying(opts: {
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partyId } = await context.params;
  const result = await requirePlaybackParty(partyId, session.spotifyId);
  if ("error" in result) return result.error;
  const { party, ref } = result as {
    party: Party;
    ref: DocumentReference;
  };

  const body = (await request.json()) as {
    action?:
      | "play"
      | "pause"
      | "skip"
      | "register-device"
      | "device-status"
      | "link-device"
      | "sync-playback";
    deviceId?: string;
    positionMs?: number;
    isPaused?: boolean;
  };

  try {
    const accessToken = await getHostAccessToken(session.spotifyId);

    if (body.action === "device-status") {
      if (!body.deviceId) {
        return NextResponse.json(
          { error: "deviceId required" },
          { status: 400 },
        );
      }
      const [playback, devices] = await Promise.all([
        getPlaybackState(accessToken),
        getPlayerDevices(accessToken),
      ]);
      const browserDevice = devices.find((d) => d.id === body.deviceId);
      const activeFromList = devices.find((d) => d.isActive);
      const activeDeviceId = playback?.deviceId ?? activeFromList?.id ?? null;
      const linked = Boolean(
        browserDevice?.isActive ||
        (activeDeviceId && activeDeviceId === body.deviceId) ||
        (party.deviceId === body.deviceId && browserDevice),
      );
      return NextResponse.json({
        ok: true,
        linked,
        browserDeviceId: body.deviceId,
        activeDeviceId,
        activeDeviceName:
          playback?.deviceName ??
          activeFromList?.name ??
          browserDevice?.name ??
          null,
        isPlaying: playback?.isPlaying ?? false,
        progressMs: playback?.progressMs ?? null,
        partyDeviceId: party.deviceId,
      });
    }

    if (body.action === "sync-playback") {
      if (!party.nowPlaying) {
        return NextResponse.json({ ok: true, synced: false });
      }

      let positionMs: number;
      let isPaused: boolean;

      const hasClientSnapshot =
        typeof body.positionMs === "number" &&
        body.positionMs >= 0 &&
        typeof body.isPaused === "boolean";

      if (hasClientSnapshot) {
        positionMs = Math.floor(body.positionMs!);
        isPaused = body.isPaused!;
      } else {
        const playback = await getPlaybackState(accessToken);
        if (!playback) {
          return NextResponse.json({ ok: true, synced: false });
        }
        // Only mirror Spotify when it is on the same track (or unknown).
        if (
          playback.trackUri &&
          party.nowPlaying.uri &&
          playback.trackUri !== party.nowPlaying.uri
        ) {
          return NextResponse.json({ ok: true, synced: false });
        }
        positionMs = playback.progressMs;
        isPaused = !playback.isPlaying;
      }

      const duration = party.nowPlaying.durationMs;
      if (typeof duration === "number" && duration > 0) {
        positionMs = Math.min(duration, Math.max(0, positionMs));
      }

      const now = Date.now();
      if (
        !shouldWritePlaybackSync(
          party,
          { positionMs, isPaused },
          now,
        )
      ) {
        return NextResponse.json({
          ok: true,
          synced: false,
          positionMs,
          isPaused,
        });
      }

      await ref.set(
        {
          isPaused,
          playbackPositionMs: positionMs,
          playbackUpdatedAt: now,
        },
        { merge: true },
      );
      return NextResponse.json({
        ok: true,
        synced: true,
        positionMs,
        isPaused,
      });
    }

    if (body.action === "register-device") {
      if (!body.deviceId) {
        return NextResponse.json(
          { error: "deviceId required" },
          { status: 400 },
        );
      }
      // Only remember the Web Playback device — do not transfer/restart playback.
      if (party.deviceId !== body.deviceId) {
        await ref.set({ deviceId: body.deviceId }, { merge: true });
      }
      return NextResponse.json({
        ok: true,
        deviceId: body.deviceId,
        linked: false,
      });
    }

    if (body.action === "link-device") {
      if (!body.deviceId) {
        return NextResponse.json(
          { error: "deviceId required" },
          { status: 400 },
        );
      }
      const deviceId = body.deviceId;
      if (party.deviceId !== deviceId) {
        await ref.set(
          { deviceId, lastActivityAt: Date.now() },
          { merge: true },
        );
      }

      const [playback, devices] = await Promise.all([
        getPlaybackState(accessToken),
        getPlayerDevices(accessToken),
      ]);
      const browserDevice = devices.find((d) => d.id === deviceId);
      const alreadyActive =
        playback?.deviceId === deviceId || Boolean(browserDevice?.isActive);

      if (!alreadyActive) {
        try {
          // Prefer transfer (keeps Spotify's playback state) over startPlayback,
          // which restarts the URI and can false-trigger track-end → skip loops.
          const shouldPlay = Boolean(party.nowPlaying && !party.isPaused);
          await transferPlayback(accessToken, deviceId, shouldPlay);
          if (shouldPlay && !playback && party.nowPlaying) {
            await startPlayback(
              accessToken,
              deviceId,
              [party.nowPlaying.uri],
              party.playbackPositionMs || 0,
            );
          }
        } catch {
          // Web Playback devices often aren't in Spotify's list for a few seconds.
          return NextResponse.json({
            ok: true,
            deviceId,
            linked: false,
            pending: true,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        deviceId,
        linked: true,
      });
    }

    const deviceId = body.deviceId || party.deviceId;
    if (!deviceId) {
      return NextResponse.json(
        {
          error:
            "No playback device — open the host page in a supported browser",
        },
        { status: 400 },
      );
    }

    if (body.action === "pause") {
      await pausePlayback(accessToken, deviceId);
      const position =
        typeof body.positionMs === "number" && body.positionMs >= 0
          ? Math.floor(body.positionMs)
          : resolvePlaybackPosition(party);
      await ref.set(
        {
          isPaused: true,
          playbackPositionMs: position,
          playbackUpdatedAt: Date.now(),
          lastActivityAt: Date.now(),
        },
        { merge: true },
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "play") {
      if (party.nowPlaying && party.isPaused) {
        await resumePlayback(accessToken, deviceId);
        await ref.set(
          {
            isPaused: false,
            deviceId,
            playbackUpdatedAt: Date.now(),
            lastActivityAt: Date.now(),
            // Keep frozen pause position as the resume baseline for guests.
            playbackPositionMs: party.playbackPositionMs || 0,
          },
          { merge: true },
        );
        return NextResponse.json({
          ok: true,
          trackId: party.nowPlaying.id,
        });
      }

      if (party.nowPlaying && !party.isPaused) {
        return NextResponse.json({
          ok: true,
          trackId: party.nowPlaying.id,
        });
      }

      const tracks = await getQueueTracks(partyId);
      const next = nextQueueTrack(tracks);
      if (!next) {
        return NextResponse.json({ error: "Queue is empty" }, { status: 400 });
      }

      await startPlayback(accessToken, deviceId, [next.uri]);
      await promoteTrackToNowPlaying({ ref, track: next, deviceId });
      return NextResponse.json({ ok: true, trackId: next.id });
    }

    if (body.action === "skip") {
      const tracks = await getQueueTracks(partyId);
      const next = nextQueueTrack(tracks);

      // Clear previous now-playing votes if any leftover track docs exist.
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
        return NextResponse.json({ ok: true, trackId: next.id });
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
      return NextResponse.json({ ok: true, trackId: null });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
