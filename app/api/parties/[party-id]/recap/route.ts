import { getAdminDb } from "@/lib/firebase/admin";
import { buildPartyRecap } from "@/lib/party/recap";
import type { Party, PartyHistoryEntry } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const partyId = (await context.params)["party-id"];
  const db = getAdminDb();
  const partySnap = await db.collection("parties").doc(partyId).get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;

  const historySnap = await db
    .collection("parties")
    .doc(partyId)
    .collection("history")
    .get();
  const history = historySnap.docs.map((doc) => doc.data() as PartyHistoryEntry);
  const recap = buildPartyRecap(history);

  const guestsSnap = await db
    .collection("parties")
    .doc(partyId)
    .collection("guests")
    .get();

  return NextResponse.json({
    party: {
      id: party.id,
      code: party.code,
      hostDisplayName: party.hostDisplayName,
      isActive: party.isActive,
      createdAt: party.createdAt,
    },
    recap,
    guestCount: guestsSnap.size,
  });
}
