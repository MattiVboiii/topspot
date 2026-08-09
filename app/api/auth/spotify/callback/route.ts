import { setHostSessionCookie } from "@/lib/auth/session";
import { exchangeCodeForTokens, fetchSpotifyProfile } from "@/lib/spotify/api";
import { getSpotifyRedirectUri } from "@/lib/spotify/config";
import { upsertHostTokens } from "@/lib/spotify/host-tokens";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const storedState = request.cookies.get("spotify_oauth_state")?.value;

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent("Invalid OAuth state")}`,
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, getSpotifyRedirectUri());
    const profile = await fetchSpotifyProfile(tokens.access_token);

    if (profile.product !== "premium") {
      return NextResponse.redirect(
        `${appUrl}/?error=${encodeURIComponent("Spotify Premium is required to host a party")}`,
      );
    }

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${appUrl}/?error=${encodeURIComponent("Missing refresh token — revoke app access and try again")}`,
      );
    }

    await upsertHostTokens({
      spotifyId: profile.id,
      displayName: profile.display_name || profile.id,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      product: profile.product,
    });

    await setHostSessionCookie({
      spotifyId: profile.id,
      displayName: profile.display_name || profile.id,
    });

    const response = NextResponse.redirect(`${appUrl}/host/new`);
    response.cookies.delete("spotify_oauth_state");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent(message)}`,
    );
  }
}
