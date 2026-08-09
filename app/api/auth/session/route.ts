import { clearHostSessionCookie, getHostSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    spotifyId: session.spotifyId,
    displayName: session.displayName,
  });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  await clearHostSessionCookie(response);
  return response;
}
