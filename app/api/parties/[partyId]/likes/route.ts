import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchLikedTracks } from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party, PartyGuest } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const offset = Number(request.nextUrl.searchParams.get("offset") || "0");
  const limit = Math.min(
    50,
    Number(request.nextUrl.searchParams.get("limit") || "20"),
  );

  const db = getAdminDb();
  const partySnap = await db.collection("parties").doc(partyId).get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }

  const hostSession = await getHostSession();
  let spotifyId: string | null = null;

  if (hostSession && hostSession.spotifyId === party.hostSpotifyId) {
    spotifyId = hostSession.spotifyId;
  } else {
    const guest = await requireGuestId(request);
    if (isErrorResponse(guest)) return guest;
    const guestSnap = await db
      .collection("parties")
      .doc(partyId)
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
    if (!guestData.spotifyId) {
      return NextResponse.json(
        { error: "Link Spotify to browse liked songs", needsSpotify: true },
        { status: 401 },
      );
    }
    spotifyId = guestData.spotifyId;
  }

  try {
    const accessToken = await getHostAccessToken(spotifyId);
    const data = await fetchLikedTracks(accessToken, limit, offset);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load likes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
