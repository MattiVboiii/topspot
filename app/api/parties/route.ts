import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { generatePartyCode } from "@/lib/party/codes";
import type { GuestMode, Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with Spotify first" },
      { status: 401 },
    );
  }

  let guestMode: GuestMode = "anonymous";
  try {
    const body = (await request.json()) as { guestMode?: GuestMode };
    if (body.guestMode === "named" || body.guestMode === "anonymous") {
      guestMode = body.guestMode;
    }
  } catch {
    // default anonymous
  }

  const db = getAdminDb();
  const partyRef = db.collection("parties").doc();
  let code = generatePartyCode();
  let attempts = 0;

  while (attempts < 8) {
    const existing = await db.collection("partyCodes").doc(code).get();
    if (!existing.exists) break;
    code = generatePartyCode();
    attempts += 1;
  }

  const now = Date.now();
  const party: Party = {
    id: partyRef.id,
    code,
    hostSpotifyId: session.spotifyId,
    hostDisplayName: session.displayName,
    guestMode,
    createdAt: now,
    isActive: true,
    nowPlayingTrackId: null,
    isPaused: true,
    deviceId: null,
  };

  const batch = db.batch();
  batch.set(partyRef, party);
  batch.set(db.collection("partyCodes").doc(code), {
    partyId: partyRef.id,
    createdAt: now,
  });
  await batch.commit();

  return NextResponse.json({ party });
}
