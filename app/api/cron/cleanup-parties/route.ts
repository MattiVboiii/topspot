import { clearStaleActiveParties } from "@/lib/party/inactivity";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await clearStaleActiveParties();
  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    cleared: result.cleared.length,
    partyIds: result.cleared,
  });
}
