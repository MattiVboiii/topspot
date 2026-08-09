import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  pausePlayback,
  resumePlayback,
  startPlayback,
  transferPlayback,
} from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party, PartyTrack } from "@/lib/types/party";
import type { DocumentReference } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

async function requireHostParty(partyId: string, spotifyId: string) {
  const ref = getAdminDb().collection("parties").doc(partyId);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      error: NextResponse.json({ error: "Party not found" }, { status: 404 }),
    } as const;
  }
  const party = snap.data() as Party;
  if (party.hostSpotifyId !== spotifyId) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { party, ref } as const;
}

async function getSortedTracks(partyId: string): Promise<PartyTrack[]> {
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("tracks")
    .orderBy("voteCount", "desc")
    .orderBy("addedAt", "asc")
    .get();
  return snap.docs.map((doc) => doc.data() as PartyTrack);
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
  const result = await requireHostParty(partyId, session.spotifyId);
  if ("error" in result) return result.error;
  const { party, ref } = result as {
    party: Party;
    ref: DocumentReference;
  };

  const body = (await request.json()) as {
    action?: "play" | "pause" | "skip" | "register-device";
    deviceId?: string;
  };

  try {
    const accessToken = await getHostAccessToken(session.spotifyId);

    if (body.action === "register-device") {
      if (!body.deviceId) {
        return NextResponse.json(
          { error: "deviceId required" },
          { status: 400 },
        );
      }
      await ref.set({ deviceId: body.deviceId }, { merge: true });
      await transferPlayback(accessToken, body.deviceId, false);
      return NextResponse.json({ ok: true, deviceId: body.deviceId });
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
      await ref.set({ isPaused: true }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "play") {
      let trackId = party.nowPlayingTrackId;
      const tracks = await getSortedTracks(partyId);

      if (!trackId || !tracks.some((t) => t.id === trackId)) {
        const next = tracks[0];
        if (!next) {
          return NextResponse.json(
            { error: "Queue is empty" },
            { status: 400 },
          );
        }
        trackId = next.id;
        await startPlayback(accessToken, deviceId, [next.uri]);
        const batch = getAdminDb().batch();
        tracks.forEach((t) => {
          batch.set(
            ref.collection("tracks").doc(t.id),
            { isPlaying: t.id === trackId },
            { merge: true },
          );
        });
        batch.set(
          ref,
          {
            nowPlayingTrackId: trackId,
            isPaused: false,
            deviceId,
          },
          { merge: true },
        );
        await batch.commit();
        return NextResponse.json({ ok: true, trackId });
      }

      await resumePlayback(accessToken, deviceId);
      await ref.set({ isPaused: false, deviceId }, { merge: true });
      return NextResponse.json({ ok: true, trackId });
    }

    if (body.action === "skip") {
      const tracks = await getSortedTracks(partyId);
      const currentId = party.nowPlayingTrackId;
      const remaining = tracks.filter((t) => t.id !== currentId);
      const next = remaining[0];

      const batch = getAdminDb().batch();
      if (currentId) {
        batch.delete(ref.collection("tracks").doc(currentId));
        const votes = await ref
          .collection("votes")
          .where("trackId", "==", currentId)
          .get();
        votes.docs.forEach((doc) => batch.delete(doc.ref));
      }

      if (next) {
        await startPlayback(accessToken, deviceId, [next.uri]);
        remaining.forEach((t) => {
          batch.set(
            ref.collection("tracks").doc(t.id),
            { isPlaying: t.id === next.id },
            { merge: true },
          );
        });
        batch.set(
          ref,
          {
            nowPlayingTrackId: next.id,
            isPaused: false,
            deviceId,
          },
          { merge: true },
        );
      } else {
        await pausePlayback(accessToken, deviceId).catch(() => undefined);
        batch.set(
          ref,
          {
            nowPlayingTrackId: null,
            isPaused: true,
            deviceId,
          },
          { merge: true },
        );
      }
      await batch.commit();
      return NextResponse.json({ ok: true, trackId: next?.id ?? null });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
