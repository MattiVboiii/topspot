import { getAdminDb } from "@/lib/firebase/admin";
import { refreshAccessToken } from "@/lib/spotify/api";

export type HostRecord = {
  spotifyId: string;
  displayName: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  product: string;
  updatedAt: number;
};

export async function upsertHostTokens(input: {
  spotifyId: string;
  displayName: string;
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  product: string;
}): Promise<void> {
  const db = getAdminDb();
  const now = Date.now();
  await db
    .collection("hosts")
    .doc(input.spotifyId)
    .set(
      {
        spotifyId: input.spotifyId,
        displayName: input.displayName,
        refreshToken: input.refreshToken,
        accessToken: input.accessToken,
        accessTokenExpiresAt: now + input.expiresIn * 1000 - 60_000,
        product: input.product,
        updatedAt: now,
      } satisfies HostRecord,
      { merge: true },
    );
}

export async function getHostAccessToken(spotifyId: string): Promise<string> {
  const db = getAdminDb();
  const snap = await db.collection("hosts").doc(spotifyId).get();
  if (!snap.exists) {
    throw new Error("Host not found — sign in with Spotify again");
  }
  const host = snap.data() as HostRecord;
  if (host.accessToken && host.accessTokenExpiresAt > Date.now()) {
    return host.accessToken;
  }

  const refreshed = await refreshAccessToken(host.refreshToken);
  const now = Date.now();
  const nextRefresh = refreshed.refresh_token ?? host.refreshToken;
  await snap.ref.set(
    {
      accessToken: refreshed.access_token,
      accessTokenExpiresAt: now + refreshed.expires_in * 1000 - 60_000,
      refreshToken: nextRefresh,
      updatedAt: now,
    },
    { merge: true },
  );
  return refreshed.access_token;
}
