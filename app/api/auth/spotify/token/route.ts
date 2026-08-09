import { getHostSession } from "@/lib/auth/session";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  try {
    const accessToken = await getHostAccessToken(session.spotifyId);
    return NextResponse.json({ accessToken });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
