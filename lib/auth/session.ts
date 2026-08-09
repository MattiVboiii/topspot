import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "topspot_host_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type HostSession = {
  spotifyId: string;
  displayName: string;
};

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

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

/** Attach host session cookie to a Response (preferred in Route Handlers). */
export async function attachHostSessionCookie(
  response: NextResponse,
  session: HostSession,
): Promise<void> {
  const token = await createHostSessionToken(session);
  response.cookies.set(COOKIE_NAME, token, cookieOptions());
}

export async function setHostSessionCookie(
  session: HostSession,
): Promise<void> {
  const token = await createHostSessionToken(session);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, cookieOptions());
}

export async function clearHostSessionCookie(
  response?: NextResponse,
): Promise<void> {
  if (response) {
    response.cookies.delete(COOKIE_NAME);
    return;
  }
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getHostSession(): Promise<HostSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyHostSessionToken(token);
}
