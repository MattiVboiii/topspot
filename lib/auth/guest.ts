import { getAdminAuth } from "@/lib/firebase/admin";
import { NextResponse } from "next/server";

export async function requireGuestId(
  request: Request,
): Promise<{ guestId: string } | NextResponse> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing guest auth" }, { status: 401 });
  }
  const idToken = header.slice("Bearer ".length);
  try {
    const decoded = await (await getAdminAuth()).verifyIdToken(idToken);
    return { guestId: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid guest auth" }, { status: 401 });
  }
}

export function isErrorResponse(
  value: { guestId: string } | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
