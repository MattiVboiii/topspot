import { getAdminDb } from "@/lib/firebase/admin";
import { searchTracks } from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const partyId = (await context.params)["party-id"];
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) {
    return NextResponse.json({ tracks: [] });
  }

  const partySnap = await getAdminDb().collection("parties").doc(partyId).get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }

  try {
    const accessToken = await getHostAccessToken(party.hostSpotifyId);
    const tracks = await searchTracks(accessToken, q);
    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
