import { getAppUrl, safeReturnPath } from "@/lib/app-url";
import { attachHostSessionCookie } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { exchangeCodeForTokens, fetchSpotifyProfile } from "@/lib/spotify/api";
import { getSpotifyRedirectUri } from "@/lib/spotify/config";
import { upsertHostTokens } from "@/lib/spotify/host-tokens";
import { NextRequest, NextResponse } from "next/server";

type OAuthIntent = {
  intent?: string;
  partyId?: string | null;
  guestId?: string | null;
  returnTo?: string | null;
};

function resolveRedirect(
  appUrl: string,
  returnTo?: string | null,
  fallback = "/",
) {
  return `${appUrl}${safeReturnPath(returnTo, fallback)}`;
}

function redirectResponse(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.delete("spotify_oauth_state");
  response.cookies.delete("spotify_oauth_intent");
  return response;
}

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const storedState = request.cookies.get("spotify_oauth_state")?.value;
  const intentRaw = request.cookies.get("spotify_oauth_intent")?.value;
  let intent: OAuthIntent = { intent: "host" };
  try {
    if (intentRaw) intent = JSON.parse(intentRaw) as OAuthIntent;
  } catch {
    intent = { intent: "host" };
  }

  if (error) {
    return redirectResponse(`${appUrl}/?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state || !storedState || state !== storedState) {
    return redirectResponse(
      `${appUrl}/?error=${encodeURIComponent("Invalid OAuth state")}`,
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, getSpotifyRedirectUri());
    const profile = await fetchSpotifyProfile(tokens.access_token);
    const isPremium = profile.product === "premium";

    if (!tokens.refresh_token) {
      return redirectResponse(
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

    if (intent.intent === "guest-link") {
      if (intent.partyId && intent.guestId) {
        await getAdminDb()
          .collection("parties")
          .doc(intent.partyId)
          .collection("guests")
          .doc(intent.guestId)
          .set(
            {
              spotifyId: profile.id,
              spotifyDisplayName: profile.display_name || profile.id,
              isPremium,
              lastSeenAt: Date.now(),
            },
            { merge: true },
          );
      }

      const response = redirectResponse(
        resolveRedirect(appUrl, intent.returnTo, "/"),
      );
      if (isPremium) {
        await attachHostSessionCookie(response, {
          spotifyId: profile.id,
          displayName: profile.display_name || profile.id,
        });
      }
      return response;
    }

    if (!isPremium) {
      return redirectResponse(
        `${appUrl}/?error=${encodeURIComponent("Spotify Premium is required to host a party")}`,
      );
    }

    const response = redirectResponse(
      resolveRedirect(appUrl, intent.returnTo, "/host/new"),
    );
    await attachHostSessionCookie(response, {
      spotifyId: profile.id,
      displayName: profile.display_name || profile.id,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    console.error("[spotify/callback]", message);
    return redirectResponse(`${appUrl}/?error=${encodeURIComponent(message)}`);
  }
}
