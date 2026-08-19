import type {
  SpotifyPlaylistSummary,
  SpotifySearchTrack,
} from "@/lib/types/party";
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

export type SpotifyPlaybackSnapshot = {
  deviceId: string | null;
  deviceName: string | null;
  isPlaying: boolean;
};

export type SpotifyConnectDevice = {
  id: string;
  name: string;
  isActive: boolean;
  isRestricted: boolean;
};

/** Available Spotify Connect targets, including the Web Playback SDK device. */
export async function getPlayerDevices(
  accessToken: string,
): Promise<SpotifyConnectDevice[]> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me/player/devices`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get player devices failed: ${text}`);
  }
  const data = (await res.json()) as {
    devices?: Array<{
      id?: string | null;
      name?: string | null;
      is_active?: boolean;
      is_restricted?: boolean;
    }>;
  };
  return (data.devices ?? [])
    .filter(
      (
        device,
      ): device is {
        id: string;
        name?: string | null;
        is_active?: boolean;
        is_restricted?: boolean;
      } => Boolean(device.id),
    )
    .map((device) => ({
      id: device.id,
      name: device.name ?? "Unknown device",
      isActive: Boolean(device.is_active),
      isRestricted: Boolean(device.is_restricted),
    }));
}

/** Current Spotify player state, or null when nothing is active (204). */
export async function getPlaybackState(
  accessToken: string,
): Promise<SpotifyPlaybackSnapshot | null> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me/player`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get playback state failed: ${text}`);
  }
  const data = (await res.json()) as {
    is_playing?: boolean;
    device?: { id?: string | null; name?: string | null } | null;
  };
  return {
    deviceId: data.device?.id ?? null,
    deviceName: data.device?.name ?? null,
    isPlaying: Boolean(data.is_playing),
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
  positionMs = 0,
): Promise<void> {
  const res = await fetch(
    `${SPOTIFY_API_BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris,
        position_ms: Math.max(0, Math.floor(positionMs)),
      }),
    },
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Start playback failed: ${text}`);
  }
}

export async function searchPlaylists(
  accessToken: string,
  query: string,
  limit = 12,
): Promise<SpotifyPlaylistSummary[]> {
  const params = new URLSearchParams({
    q: query,
    type: "playlist",
    limit: String(limit),
  });
  const res = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error("Spotify playlist search failed");
  }
  const data = (await res.json()) as {
    playlists?: {
      items: Array<{
        id: string;
        name: string;
        description: string | null;
        uri: string;
        images: { url: string }[];
        owner: { display_name: string | null };
        tracks: { total: number };
      } | null>;
    };
  };
  return (data.playlists?.items ?? [])
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.images[0]?.url ?? null,
      ownerName: p.owner.display_name || "Unknown",
      trackCount: p.tracks.total,
      uri: p.uri,
    }));
}

export async function fetchPlaylistTracks(
  accessToken: string,
  playlistId: string,
  limit = 100,
  offset = 0,
): Promise<SpotifySearchTrack[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    fields: "items(track(id,name,uri,duration_ms,artists,album))",
  });
  const res = await fetch(
    `${SPOTIFY_API_BASE}/playlists/${encodeURIComponent(playlistId)}/tracks?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load playlist tracks: ${text}`);
  }
  const data = (await res.json()) as {
    items: Array<{ track: SpotifyApiTrack | null }>;
  };
  return data.items
    .map((item) => item.track)
    .filter((track): track is SpotifyApiTrack => Boolean(track?.id))
    .map(mapTrack);
}

export async function fetchLikedTracks(
  accessToken: string,
  limit = 20,
  offset = 0,
): Promise<{ tracks: SpotifySearchTrack[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${SPOTIFY_API_BASE}/me/tracks?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load liked songs: ${text}`);
  }
  const data = (await res.json()) as {
    items: Array<{ track: SpotifyApiTrack | null }>;
    total: number;
  };
  return {
    total: data.total,
    tracks: data.items
      .map((item) => item.track)
      .filter((track): track is SpotifyApiTrack => Boolean(track?.id))
      .map(mapTrack),
  };
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
