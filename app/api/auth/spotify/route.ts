import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_SCOPES,
  getSpotifyClientId,
  getSpotifyRedirectUri,
} from "@/lib/spotify/config";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: getSpotifyClientId(),
      response_type: "code",
      redirect_uri: getSpotifyRedirectUri(),
      scope: SPOTIFY_SCOPES,
      state,
      show_dialog: "true",
    });

    const response = NextResponse.redirect(`${SPOTIFY_AUTH_URL}?${params}`);
    response.cookies.set("spotify_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
