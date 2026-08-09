import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import type { GuestMode, Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const snap = await getAdminDb().collection("parties").doc(partyId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  return NextResponse.json({ party: snap.data() as Party });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partyId } = await context.params;
  const ref = getAdminDb().collection("parties").doc(partyId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = snap.data() as Party;
  if (party.hostSpotifyId !== session.spotifyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    guestMode?: GuestMode;
    isActive?: boolean;
    deviceId?: string | null;
  };

  const updates: Partial<Party> = {};
  if (body.guestMode === "anonymous" || body.guestMode === "named") {
    updates.guestMode = body.guestMode;
  }
  if (typeof body.isActive === "boolean") {
    updates.isActive = body.isActive;
  }
  if (body.deviceId !== undefined) {
    updates.deviceId = body.deviceId;
  }

  await ref.set(updates, { merge: true });
  const next = (await ref.get()).data() as Party;
  return NextResponse.json({ party: next });
}
