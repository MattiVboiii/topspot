import { getHostSession, type HostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { isPartyOwner, isPlaybackController } from "@/lib/party/ownership";
import type { Party } from "@/lib/types/party";
import type { DocumentReference } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export function jsonError(error: string, status: number, extra?: object) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function requireHostSessionOr401(): Promise<
  HostSession | NextResponse
> {
  const session = await getHostSession();
  if (!session) return jsonError("Unauthorized", 401);
  return session;
}

export async function requireParty(
  partyId: string,
): Promise<{ party: Party; ref: DocumentReference } | { error: NextResponse }> {
  const ref = getAdminDb().collection("parties").doc(partyId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { error: jsonError("Party not found", 404) };
  }
  return { party: snap.data() as Party, ref };
}

export async function requirePlaybackControllerParty(
  partyId: string,
  spotifyId: string,
): Promise<{ party: Party; ref: DocumentReference } | { error: NextResponse }> {
  const result = await requireParty(partyId);
  if ("error" in result) return result;
  if (!isPlaybackController(result.party, spotifyId)) {
    return {
      error: jsonError("Only the current music controller can do that", 403),
    };
  }
  return result;
}

export async function requirePartyOwner(
  partyId: string,
  spotifyId: string,
): Promise<{ party: Party; ref: DocumentReference } | { error: NextResponse }> {
  const result = await requireParty(partyId);
  if ("error" in result) return result;
  if (!isPartyOwner(result.party, spotifyId)) {
    return { error: jsonError("Forbidden", 403) };
  }
  return result;
}
