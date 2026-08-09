import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { generatePartyCode } from "@/lib/party/codes";
import { ensurePartyFresh } from "@/lib/party/inactivity";
import {
  getHostActivePartyId,
  setHostActiveParty,
} from "@/lib/spotify/host-tokens";
import type { GuestMode, Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ authenticated: false, party: null });
  }

  const activeId = await getHostActivePartyId(session.spotifyId);
  if (activeId) {
    const snap = await getAdminDb().collection("parties").doc(activeId).get();
    if (
      snap.exists &&
      (snap.data() as Party).isActive &&
      (snap.data() as Party).hostSpotifyId === session.spotifyId
    ) {
      const party = await ensurePartyFresh(snap.data() as Party);
      return NextResponse.json({
        authenticated: true,
        displayName: session.displayName,
        party,
      });
    }
    await setHostActiveParty(session.spotifyId, null);
  }

  // Backfill: find an active party owned by this Spotify account.
  const owned = await getAdminDb()
    .collection("parties")
    .where("hostSpotifyId", "==", session.spotifyId)
    .limit(20)
    .get();
  const active = owned.docs
    .map((d) => d.data() as Party)
    .find((p) => p.isActive);
  if (active) {
    const party = await ensurePartyFresh(active);
    await setHostActiveParty(session.spotifyId, party.id);
    return NextResponse.json({
      authenticated: true,
      displayName: session.displayName,
      party,
    });
  }

  return NextResponse.json({
    authenticated: true,
    displayName: session.displayName,
    party: null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in with Spotify first" },
      { status: 401 },
    );
  }

  const db = getAdminDb();

  // Resume the owner's active party instead of creating another.
  const existingLookup = await GET();
  const existingJson = (await existingLookup.json()) as {
    party?: Party | null;
  };
  if (existingJson.party) {
    return NextResponse.json({
      party: existingJson.party,
      resumed: true,
    });
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
    lastActivityAt: now,
    isActive: true,
    nowPlayingTrackId: null,
    nowPlaying: null,
    isPaused: true,
    deviceId: null,
    playbackPositionMs: 0,
    playbackUpdatedAt: now,
    playbackStartedAt: null,
    downvoteMode: "off",
    downvoteThreshold: null,
    fallbackPlaylistId: null,
    fallbackPlaylistName: null,
    playbackSpotifyId: session.spotifyId,
    playbackGuestId: null,
    pendingPlaybackGuestId: null,
  };

  const batch = db.batch();
  batch.set(partyRef, party);
  batch.set(db.collection("partyCodes").doc(code), {
    partyId: partyRef.id,
    createdAt: now,
  });
  batch.set(
    db.collection("hosts").doc(session.spotifyId),
    { activePartyId: partyRef.id, updatedAt: now },
    { merge: true },
  );
  await batch.commit();

  return NextResponse.json({ party, resumed: false });
}
