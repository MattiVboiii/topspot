export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

export const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type SpotifyUserProfile = {
  id: string;
  display_name: string | null;
  email?: string;
  product: string;
};

export type SpotifyApiTrack = {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit: boolean;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; height: number | null; width: number | null }[];
  };
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

export function getSpotifyClientId(): string {
  return requireEnv("SPOTIFY_CLIENT_ID");
}

export function getSpotifyClientSecret(): string {
  return requireEnv("SPOTIFY_CLIENT_SECRET");
}

export function getSpotifyRedirectUri(): string {
  return (
    process.env.SPOTIFY_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/spotify/callback`
  );
}

export function basicAuthHeader(): string {
  const credentials = Buffer.from(
    `${getSpotifyClientId()}:${getSpotifyClientSecret()}`,
  ).toString("base64");
  return `Basic ${credentials}`;
}
