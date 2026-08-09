import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  downvotesEnabled,
  netVoteCount,
  usesDownvoteThreshold,
} from "@/lib/party/queue";
import type {
  Party,
  PartyGuest,
  PartyTrack,
  PartyVote,
} from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const body = (await request.json()) as {
    trackId?: string;
    action?: "up" | "down" | "clear";
  };
  if (
    !body.trackId ||
    (body.action !== "up" && body.action !== "down" && body.action !== "clear")
  ) {
    return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
  }

  const db = getAdminDb();
  const partyRef = db.collection("parties").doc(partyId);
  const partySnap = await partyRef.get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (!party.isActive) {
    return NextResponse.json({ error: "Party has ended" }, { status: 410 });
  }

  const downvoteMode = party.downvoteMode ?? "off";
  if (body.action === "down" && !downvotesEnabled(downvoteMode)) {
    return NextResponse.json(
      { error: "Downvotes are disabled for this party" },
      { status: 403 },
    );
  }

  const guestSnap = await partyRef
    .collection("guests")
    .doc(guest.guestId)
    .get();
  if (!guestSnap.exists) {
    return NextResponse.json(
      { error: "Join the party first" },
      { status: 403 },
    );
  }
  const guestData = guestSnap.data() as PartyGuest;
  if (party.guestMode === "named" && !guestData.displayName) {
    return NextResponse.json(
      { error: "Display name required" },
      { status: 403 },
    );
  }

  const trackRef = partyRef.collection("tracks").doc(body.trackId);
  const trackSnap = await trackRef.get();
  if (!trackSnap.exists) {
    return NextResponse.json({ error: "Track not in queue" }, { status: 404 });
  }

  const voteId = `${body.trackId}_${guest.guestId}`;
  const voteRef = partyRef.collection("votes").doc(voteId);
  const voteSnap = await voteRef.get();
  const existing = voteSnap.exists ? (voteSnap.data() as PartyVote) : null;
  const previousValue = existing?.value ?? 0;

  let nextValue: 0 | 1 | -1 = 0;
  if (body.action === "up") {
    nextValue = previousValue === 1 ? 0 : 1;
  } else if (body.action === "down") {
    nextValue = previousValue === -1 ? 0 : -1;
  } else {
    nextValue = 0;
  }

  let up = (trackSnap.data() as PartyTrack).upVoteCount ?? 0;
  let down = (trackSnap.data() as PartyTrack).downVoteCount ?? 0;
  if (previousValue === 1) up -= 1;
  if (previousValue === -1) down -= 1;
  if (nextValue === 1) up += 1;
  if (nextValue === -1) down += 1;
  up = Math.max(0, up);
  down = Math.max(0, down);

  const batch = db.batch();
  if (nextValue === 0) {
    if (voteSnap.exists) batch.delete(voteRef);
  } else {
    batch.set(voteRef, {
      trackId: body.trackId,
      guestId: guest.guestId,
      value: nextValue,
      createdAt: existing?.createdAt ?? Date.now(),
    } satisfies PartyVote);
  }

  const voteCount = netVoteCount(up, down, downvoteMode);
  batch.update(trackRef, {
    upVoteCount: up,
    downVoteCount: down,
    voteCount,
  });

  const threshold = party.downvoteThreshold ?? null;
  const shouldRemove =
    usesDownvoteThreshold(downvoteMode) &&
    typeof threshold === "number" &&
    down >= threshold;

  if (shouldRemove) {
    batch.delete(trackRef);
    const votes = await partyRef
      .collection("votes")
      .where("trackId", "==", body.trackId)
      .get();
    votes.docs.forEach((doc) => batch.delete(doc.ref));
  }

  await batch.commit();

  if (shouldRemove) {
    return NextResponse.json({
      track: null,
      removed: true,
      myVote: 0,
    });
  }

  const next = (await trackRef.get()).data() as PartyTrack;
  return NextResponse.json({
    track: next,
    removed: false,
    myVote: nextValue,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("votes")
    .where("guestId", "==", guest.guestId)
    .get();

  const votes: Record<string, 1 | -1> = {};
  const trackIds: string[] = [];
  snap.docs.forEach((doc) => {
    const data = doc.data() as PartyVote;
    const value = data.value === -1 ? -1 : 1;
    votes[data.trackId] = value;
    if (value === 1) trackIds.push(data.trackId);
  });

  return NextResponse.json({ votes, trackIds });
}
