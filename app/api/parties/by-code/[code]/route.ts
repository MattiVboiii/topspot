import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizePartyCode } from "@/lib/party/codes";
import type { Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await context.params;
  const code = normalizePartyCode(raw);
  const db = getAdminDb();
  const map = await db.collection("partyCodes").doc(code).get();
  if (!map.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const partyId = (map.data() as { partyId: string }).partyId;
  const partySnap = await db.collection("parties").doc(partyId).get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }
  return NextResponse.json({ party });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { code: raw } = await context.params;
  const code = normalizePartyCode(raw);
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
  };

  const db = getAdminDb();
  const map = await db.collection("partyCodes").doc(code).get();
  if (!map.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const partyId = (map.data() as { partyId: string }).partyId;
  const partySnap = await db.collection("parties").doc(partyId).get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }

  let displayName: string | null = null;
  if (party.guestMode === "named") {
    const name = body.displayName?.trim() ?? "";
    if (name.length < 1 || name.length > 24) {
      return NextResponse.json(
        { error: "Display name required (1–24 characters)" },
        { status: 400 },
      );
    }
    displayName = name;
  }

  const now = Date.now();
  const guestRef = db
    .collection("parties")
    .doc(partyId)
    .collection("guests")
    .doc(guest.guestId);
  const existing = await guestRef.get();
  await guestRef.set(
    {
      id: guest.guestId,
      displayName:
        displayName ??
        (existing.exists
          ? ((existing.data() as { displayName?: string | null }).displayName ??
            null)
          : null),
      joinedAt: existing.exists
        ? ((existing.data() as { joinedAt?: number }).joinedAt ?? now)
        : now,
      lastSeenAt: now,
      isSearching: false,
      spotifyId: existing.exists
        ? ((existing.data() as { spotifyId?: string | null }).spotifyId ?? null)
        : null,
      spotifyDisplayName: existing.exists
        ? ((existing.data() as { spotifyDisplayName?: string | null })
            .spotifyDisplayName ?? null)
        : null,
      isPremium: existing.exists
        ? Boolean((existing.data() as { isPremium?: boolean }).isPremium)
        : false,
    },
    { merge: true },
  );

  return NextResponse.json({ party, guestId: guest.guestId, displayName });
}
