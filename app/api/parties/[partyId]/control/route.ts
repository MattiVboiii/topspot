import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { isPlaybackController } from "@/lib/party/ownership";
import { nextQueueTrack, toNowPlayingSnapshot } from "@/lib/party/queue";
import {
  getPlaybackState,
  pausePlayback,
  resumePlayback,
  startPlayback,
  transferPlayback,
} from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party, PartyTrack } from "@/lib/types/party";
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
      | "link-device";
    deviceId?: string;
    positionMs?: number;
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
      const playback = await getPlaybackState(accessToken);
      const activeDeviceId = playback?.deviceId ?? null;
      const linked = Boolean(
        activeDeviceId && activeDeviceId === body.deviceId,
      );
      return NextResponse.json({
        ok: true,
        linked,
        browserDeviceId: body.deviceId,
        activeDeviceId,
        activeDeviceName: playback?.deviceName ?? null,
        isPlaying: playback?.isPlaying ?? false,
        partyDeviceId: party.deviceId,
      });
    }

    async function linkBrowserDevice(deviceId: string, force: boolean) {
      const alreadyStored = party.deviceId === deviceId;
      if (!alreadyStored || force) {
        await ref.set(
          { deviceId, lastActivityAt: Date.now() },
          { merge: true },
        );
      }

      // Always transfer when forcing (user clicked Relink). On first register,
      // skip only if Spotify already has this browser as the active device.
      const playback = await getPlaybackState(accessToken);
      const alreadyActive = playback?.deviceId === deviceId;
      if (force || !alreadyActive) {
        await transferPlayback(accessToken, deviceId, false);
        if (party.nowPlaying && !party.isPaused) {
          await startPlayback(
            accessToken,
            deviceId,
            [party.nowPlaying.uri],
            party.playbackPositionMs || 0,
          );
        }
      }

      return NextResponse.json({
        ok: true,
        deviceId,
        linked: true,
      });
    }

    if (body.action === "register-device" || body.action === "link-device") {
      if (!body.deviceId) {
        return NextResponse.json(
          { error: "deviceId required" },
          { status: 400 },
        );
      }
      return await linkBrowserDevice(
        body.deviceId,
        body.action === "link-device",
      );
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
          : party.playbackPositionMs || 0;
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
