import type { SpotifySearchTrack } from "@/lib/types/party";
import {
  SPOTIFY_API_BASE,
  SPOTIFY_TOKEN_URL,
  basicAuthHeader,
  type SpotifyApiTrack,
  type SpotifyTokenResponse,
  type SpotifyUserProfile,
} from "./config";

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed: ${text}`);
  }

  return res.json() as Promise<SpotifyTokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed: ${text}`);
  }

  return res.json() as Promise<SpotifyTokenResponse>;
}

export async function fetchSpotifyProfile(
  accessToken: string,
): Promise<SpotifyUserProfile> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error("Failed to fetch Spotify profile");
  }
  return res.json() as Promise<SpotifyUserProfile>;
}

export async function searchTracks(
  accessToken: string,
  query: string,
  limit = 12,
): Promise<SpotifySearchTrack[]> {
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
  });
  const res = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error("Spotify search failed");
  }
  const data = (await res.json()) as {
    tracks?: { items: SpotifyApiTrack[] };
  };
  return (data.tracks?.items ?? []).map(mapTrack);
}

export function mapTrack(track: SpotifyApiTrack): SpotifySearchTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map((a) => a.name).join(", "),
    albumName: track.album.name,
    albumArtUrl: track.album.images[0]?.url ?? null,
    durationMs: track.duration_ms,
    uri: track.uri,
  };
}

export async function transferPlayback(
  accessToken: string,
  deviceId: string,
  play = false,
): Promise<void> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me/player`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Transfer playback failed: ${text}`);
  }
}

export async function startPlayback(
  accessToken: string,
  deviceId: string,
  uris: string[],
): Promise<void> {
  const res = await fetch(
    `${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris }),
    },
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Start playback failed: ${text}`);
  }
}

export async function pausePlayback(
  accessToken: string,
  deviceId?: string,
): Promise<void> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/pause`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Pause failed: ${text}`);
  }
}

export async function resumePlayback(
  accessToken: string,
  deviceId?: string,
): Promise<void> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/play`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Resume failed: ${text}`);
  }
}

export async function skipToNext(
  accessToken: string,
  deviceId?: string,
): Promise<void> {
  const url = deviceId
    ? `${SPOTIFY_API_BASE}/me/player/next?device_id=${encodeURIComponent(deviceId)}`
    : `${SPOTIFY_API_BASE}/me/player/next`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Skip failed: ${text}`);
  }
}
