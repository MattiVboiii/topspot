import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { isPartyOwner } from "@/lib/party/ownership";
import { buildPartyRecap } from "@/lib/party/recap";
import {
  addTracksToPlaylist,
  createPlaylist,
} from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party, PartyHistoryEntry } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partyId = (await context.params)["party-id"];
  const db = getAdminDb();
  const partySnap = await db.collection("parties").doc(partyId).get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!isPartyOwner(party, session.spotifyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
  };

  const historySnap = await db
    .collection("parties")
    .doc(partyId)
    .collection("history")
    .get();
  const history = historySnap.docs.map((doc) => doc.data() as PartyHistoryEntry);
  const recap = buildPartyRecap(history);
  const uris = recap.topTracks.map((t) => t.uri).filter(Boolean);

  if (uris.length === 0) {
    return NextResponse.json(
      { error: "No played tracks to export" },
      { status: 400 },
    );
  }

  const playlistName =
    (typeof body.name === "string" && body.name.trim()) ||
    `TopSpot · ${party.code}`;

  try {
    const accessToken = await getHostAccessToken(session.spotifyId);
    const playlist = await createPlaylist(accessToken, session.spotifyId, {
      name: playlistName,
      description: `Party ${party.code} recap from TopSpot`,
      isPublic: false,
    });
    await addTracksToPlaylist(accessToken, playlist.id, uris);
    return NextResponse.json({
      ok: true,
      playlist,
      trackCount: uris.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Export failed";
    const needsReauth =
      message.includes("Insufficient") ||
      message.includes("403") ||
      message.toLowerCase().includes("scope");
    return NextResponse.json(
      {
        error: needsReauth
          ? "Spotify needs playlist permission — sign out and sign in again with Spotify"
          : message,
        needsReauth,
      },
      { status: 500 },
    );
  }
}
