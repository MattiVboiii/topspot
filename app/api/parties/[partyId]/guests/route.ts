import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Party, PartyGuest } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partyId } = await context.params;
  const partyRef = getAdminDb().collection("parties").doc(partyId);
  const partySnap = await partyRef.get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (party.hostSpotifyId !== session.spotifyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snap = await partyRef.collection("guests").get();
  const guests = snap.docs
    .map((doc) => doc.data() as PartyGuest)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  return NextResponse.json({ guests });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "heartbeat" | "leave";
    isSearching?: boolean;
  };

  const partyRef = getAdminDb().collection("parties").doc(partyId);
  const partySnap = await partyRef.get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }

  const guestRef = partyRef.collection("guests").doc(guest.guestId);
  const existing = await guestRef.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Not in party" }, { status: 404 });
  }

  if (body.action === "leave") {
    await guestRef.set({ lastSeenAt: 0, isSearching: false }, { merge: true });
    return NextResponse.json({ ok: true });
  }

  const patch: Partial<PartyGuest> = {
    lastSeenAt: Date.now(),
  };
  if (typeof body.isSearching === "boolean") {
    patch.isSearching = body.isSearching;
  }

  await guestRef.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}
