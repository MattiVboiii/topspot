import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  Party,
  PartyGuest,
  PartyTrack,
  SpotifySearchTrack,
} from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("tracks")
    .orderBy("voteCount", "desc")
    .orderBy("addedAt", "asc")
    .get();

  const tracks = snap.docs.map((doc) => doc.data() as PartyTrack);
  return NextResponse.json({ tracks });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const body = (await request.json()) as { track?: SpotifySearchTrack };
  if (!body.track?.id || !body.track.uri) {
    return NextResponse.json({ error: "Invalid track" }, { status: 400 });
  }

  const db = getAdminDb();
  const partyRef = db.collection("parties").doc(partyId);
  const partySnap = await partyRef.get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }

  const guestSnap = await partyRef
    .collection("guests")
    .doc(guest.guestId)
    .get();
  if (!guestSnap.exists) {
    return NextResponse.json(
      { error: "Join the party first" },
      { status: 403 },
    );
  }
  const guestData = guestSnap.data() as PartyGuest;
  if (party.guestMode === "named" && !guestData.displayName) {
    return NextResponse.json(
      { error: "Display name required" },
      { status: 403 },
    );
  }

  const trackRef = partyRef.collection("tracks").doc(body.track.id);
  const existing = await trackRef.get();
  if (existing.exists) {
    return NextResponse.json({
      track: existing.data() as PartyTrack,
      alreadyQueued: true,
    });
  }

  const track: PartyTrack = {
    id: body.track.id,
    name: body.track.name,
    artists: body.track.artists,
    albumName: body.track.albumName,
    albumArtUrl: body.track.albumArtUrl,
    durationMs: body.track.durationMs,
    uri: body.track.uri,
    voteCount: 1,
    addedBy: guest.guestId,
    addedByName: guestData.displayName,
    addedAt: Date.now(),
    isPlaying: false,
  };

  const batch = db.batch();
  batch.set(trackRef, track);
  batch.set(
    partyRef.collection("votes").doc(`${body.track.id}_${guest.guestId}`),
    {
      trackId: body.track.id,
      guestId: guest.guestId,
      createdAt: Date.now(),
    },
  );
  await batch.commit();

  return NextResponse.json({ track, alreadyQueued: false });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partyId } = await context.params;
  const trackId = request.nextUrl.searchParams.get("trackId");
  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }

  const db = getAdminDb();
  const partyRef = db.collection("parties").doc(partyId);
  const partySnap = await partyRef.get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (party.hostSpotifyId !== session.spotifyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const votes = await partyRef
    .collection("votes")
    .where("trackId", "==", trackId)
    .get();
  const batch = db.batch();
  votes.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(partyRef.collection("tracks").doc(trackId));

  if (party.nowPlayingTrackId === trackId) {
    batch.set(
      partyRef,
      { nowPlayingTrackId: null, isPaused: true },
      { merge: true },
    );
  }
  await batch.commit();

  return NextResponse.json({ ok: true });
}
