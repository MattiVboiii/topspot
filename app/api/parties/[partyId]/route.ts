import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensurePartyFresh } from "@/lib/party/inactivity";
import { isPartyOwner } from "@/lib/party/ownership";
import { setHostActiveParty } from "@/lib/spotify/host-tokens";
import type { DownvoteMode, GuestMode, Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

const DOWNVOTE_MODES: DownvoteMode[] = [
  "off",
  "score",
  "threshold",
  "score_and_threshold",
];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const snap = await getAdminDb().collection("parties").doc(partyId).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = await ensurePartyFresh(snap.data() as Party);
  return NextResponse.json({ party });
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
  if (!isPartyOwner(party, session.spotifyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    guestMode?: GuestMode;
    isActive?: boolean;
    deviceId?: string | null;
    downvoteMode?: DownvoteMode;
    downvoteThreshold?: number | null;
    fallbackPlaylistId?: string | null;
    fallbackPlaylistName?: string | null;
    trackCooldownMinutes?: number;
    maxActiveRequestsPerGuest?: number;
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
  if (body.downvoteMode && DOWNVOTE_MODES.includes(body.downvoteMode)) {
    updates.downvoteMode = body.downvoteMode;
  }
  if (body.downvoteThreshold !== undefined) {
    if (
      body.downvoteThreshold === null ||
      (typeof body.downvoteThreshold === "number" &&
        body.downvoteThreshold >= 1)
    ) {
      updates.downvoteThreshold = body.downvoteThreshold;
    }
  }
  if (body.fallbackPlaylistId !== undefined) {
    updates.fallbackPlaylistId = body.fallbackPlaylistId;
  }
  if (body.fallbackPlaylistName !== undefined) {
    updates.fallbackPlaylistName = body.fallbackPlaylistName;
  }
  if (
    typeof body.trackCooldownMinutes === "number" &&
    Number.isFinite(body.trackCooldownMinutes) &&
    body.trackCooldownMinutes >= 0 &&
    body.trackCooldownMinutes <= 24 * 60
  ) {
    updates.trackCooldownMinutes = Math.floor(body.trackCooldownMinutes);
  }
  if (
    typeof body.maxActiveRequestsPerGuest === "number" &&
    Number.isFinite(body.maxActiveRequestsPerGuest) &&
    body.maxActiveRequestsPerGuest >= 0 &&
    body.maxActiveRequestsPerGuest <= 50
  ) {
    updates.maxActiveRequestsPerGuest = Math.floor(
      body.maxActiveRequestsPerGuest,
    );
  }

  if (Object.keys(updates).length > 0) {
    updates.lastActivityAt = Date.now();
  }

  await ref.set(updates, { merge: true });

  if (body.isActive === false) {
    await setHostActiveParty(session.spotifyId, null);
  }

  const next = (await ref.get()).data() as Party;
  return NextResponse.json({ party: next });
}
