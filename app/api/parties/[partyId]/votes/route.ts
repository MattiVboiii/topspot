import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Party, PartyGuest, PartyTrack } from "@/lib/types/party";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const body = (await request.json()) as {
    trackId?: string;
    action?: "up" | "down";
  };
  if (!body.trackId || (body.action !== "up" && body.action !== "down")) {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
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

  const trackRef = partyRef.collection("tracks").doc(body.trackId);
  const trackSnap = await trackRef.get();
  if (!trackSnap.exists) {
    return NextResponse.json({ error: "Track not in queue" }, { status: 404 });
  }

  const voteId = `${body.trackId}_${guest.guestId}`;
  const voteRef = partyRef.collection("votes").doc(voteId);
  const voteSnap = await voteRef.get();

  if (body.action === "up") {
    if (voteSnap.exists) {
      return NextResponse.json({
        track: trackSnap.data() as PartyTrack,
        voted: true,
      });
    }
    const batch = db.batch();
    batch.set(voteRef, {
      trackId: body.trackId,
      guestId: guest.guestId,
      createdAt: Date.now(),
    });
    batch.update(trackRef, { voteCount: FieldValue.increment(1) });
    await batch.commit();
  } else {
    if (!voteSnap.exists) {
      return NextResponse.json({
        track: trackSnap.data() as PartyTrack,
        voted: false,
      });
    }
    const batch = db.batch();
    batch.delete(voteRef);
    batch.update(trackRef, { voteCount: FieldValue.increment(-1) });
    await batch.commit();
  }

  const next = (await trackRef.get()).data() as PartyTrack;
  return NextResponse.json({
    track: next,
    voted: body.action === "up",
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("votes")
    .where("guestId", "==", guest.guestId)
    .get();

  const trackIds = snap.docs.map(
    (doc) => (doc.data() as { trackId: string }).trackId,
  );
  return NextResponse.json({ trackIds });
}
