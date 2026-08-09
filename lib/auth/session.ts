import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "topspot_host_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type HostSession = {
  spotifyId: string;
  displayName: string;
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET must be set (16+ chars; use 32+ in production)",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createHostSessionToken(
  session: HostSession,
): Promise<string> {
  return new SignJWT({
    spotifyId: session.spotifyId,
    displayName: session.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyHostSessionToken(
  token: string,
): Promise<HostSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.spotifyId !== "string" ||
      typeof payload.displayName !== "string"
    ) {
      return null;
    }
    return {
      spotifyId: payload.spotifyId,
      displayName: payload.displayName,
    };
  } catch {
    return null;
  }
}

export async function setHostSessionCookie(
  session: HostSession,
): Promise<void> {
  const token = await createHostSessionToken(session);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearHostSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getHostSession(): Promise<HostSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyHostSessionToken(token);
}
