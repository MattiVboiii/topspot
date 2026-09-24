import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { fetchPlaylistTracks, searchPlaylists } from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { Party } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

async function requireHost(partyId: string, spotifyId: string) {
  const snap = await getAdminDb().collection("parties").doc(partyId).get();
  if (!snap.exists) {
    return {
      error: NextResponse.json({ error: "Party not found" }, { status: 404 }),
    } as const;
  }
  const party = snap.data() as Party;
  if (party.hostSpotifyId !== spotifyId) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { party } as const;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partyId = (await context.params)["party-id"];
  const result = await requireHost(partyId, session.spotifyId);
  if ("error" in result) return result.error;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const playlistId = request.nextUrl.searchParams.get("playlistId")?.trim();

  try {
    const accessToken = await getHostAccessToken(session.spotifyId);

    if (playlistId) {
      const tracks = await fetchPlaylistTracks(accessToken, playlistId, 100, 0);
      return NextResponse.json({ tracks });
    }

    if (q.length < 2) {
      return NextResponse.json({ playlists: [] });
    }

    const playlists = await searchPlaylists(accessToken, q, 12);
    return NextResponse.json({ playlists });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Playlist lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
