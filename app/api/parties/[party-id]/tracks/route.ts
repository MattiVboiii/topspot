import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  jsonError,
  requireHostSessionOr401,
  requireParty,
  requirePartyOwner,
} from "@/lib/party/http";
import { touchPartyActivity } from "@/lib/party/inactivity";
import { sortPartyQueue } from "@/lib/party/queue";
import {
  areIncomingTracksValid,
  buildPartyTrack,
  collectIncomingTracks,
  countGuestActiveRequests,
  countWouldAddRequests,
  getTrackCooldownMs,
  guestRequestLimitExceeded,
  normalizeTrackSource,
  shouldSkipTrackAdd,
} from "@/lib/party/tracks";
import type {
  PartyGuest,
  PartyHistoryEntry,
  PartyTrack,
  SpotifySearchTrack,
} from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const partyId = (await context.params)["party-id"];
  const snap = await getAdminDb()
    .collection("parties")
    .doc(partyId)
    .collection("tracks")
    .get();

  const tracks = sortPartyQueue(
    snap.docs.map((doc) => doc.data() as PartyTrack),
  );
  return NextResponse.json({ tracks });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const partyId = (await context.params)["party-id"];
  const body = (await request.json()) as {
    track?: SpotifySearchTrack;
    tracks?: SpotifySearchTrack[];
    source?: "request" | "fallback";
  };

  const source = normalizeTrackSource(body.source);
  const incoming = collectIncomingTracks(body);

  if (!areIncomingTracksValid(incoming)) {
    return jsonError("Invalid track", 400);
  }

  const partyResult = await requireParty(partyId);
  if ("error" in partyResult) return partyResult.error;
  const { party, ref: partyRef } = partyResult;

  if (!party.isActive) {
    return jsonError("Party has ended", 410);
  }

  if (source === "fallback") {
    const session = await getHostSession();
    if (!session || session.spotifyId !== party.hostSpotifyId) {
      return jsonError("Forbidden", 403);
    }
  }

  const guestSnap = await partyRef
    .collection("guests")
    .doc(guest.guestId)
    .get();
  if (!guestSnap.exists) {
    return jsonError("Join the party first", 403);
  }
  const guestData = guestSnap.data() as PartyGuest;
  if (party.guestMode === "named" && !guestData.displayName) {
    return jsonError("Display name required", 403);
  }

  const db = getAdminDb();
  const ids = incoming.map((t) => t.id);
  const existingIds = new Set<string>();
  if (ids.length > 0) {
    const existingSnaps = await db.getAll(
      ...ids.map((id) => partyRef.collection("tracks").doc(id)),
    );
    existingSnaps.filter((s) => s.exists).forEach((s) => existingIds.add(s.id));
  }

  const { cooldownMinutes, cooldownMs } = getTrackCooldownMs(party);
  const onCooldown = new Set<string>();

  if (source === "request" && cooldownMs > 0 && ids.length > 0) {
    const historySnaps = await db.getAll(
      ...ids.map((id) => partyRef.collection("history").doc(id)),
    );
    const now = Date.now();
    for (const snap of historySnaps) {
      if (!snap.exists) continue;
      const entry = snap.data() as PartyHistoryEntry;
      if (now - (entry.playedAt ?? 0) < cooldownMs) {
        onCooldown.add(snap.id);
      }
    }
  }

  if (source === "request") {
    const queueSnap = await partyRef.collection("tracks").get();
    const queueTracks = queueSnap.docs.map((doc) => doc.data() as PartyTrack);
    const activeCount = countGuestActiveRequests(queueTracks, guest.guestId);
    const wouldAdd = countWouldAddRequests({
      incoming,
      existingIds,
      party,
      onCooldown,
    });
    const limit = guestRequestLimitExceeded({
      party,
      activeCount,
      wouldAdd,
    });
    if (limit.exceeded) {
      return NextResponse.json(
        {
          error: `You can have at most ${limit.maxActive} active request${limit.maxActive === 1 ? "" : "s"} in the queue`,
          code: "GUEST_REQUEST_LIMIT",
          maxActiveRequestsPerGuest: limit.maxActive,
          activeCount: limit.activeCount,
        },
        { status: 429 },
      );
    }
  }

  const added: PartyTrack[] = [];
  const skipped: string[] = [];
  const cooldownSkipped: string[] = [];
  const now = Date.now();
  let batch = db.batch();
  let ops = 0;

  async function flush() {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }

  for (let i = 0; i < incoming.length; i += 1) {
    const item = incoming[i];
    if (
      shouldSkipTrackAdd({
        trackId: item.id,
        existingIds,
        party,
      })
    ) {
      skipped.push(item.id);
      continue;
    }

    if (source === "request" && onCooldown.has(item.id)) {
      cooldownSkipped.push(item.id);
      continue;
    }

    const track = buildPartyTrack({
      item,
      source,
      guestId: guest.guestId,
      guestData,
      addedAt: now + i,
    });

    batch.set(partyRef.collection("tracks").doc(item.id), track);
    ops += 1;
    if (source === "request") {
      batch.set(
        partyRef.collection("votes").doc(`${item.id}_${guest.guestId}`),
        {
          trackId: item.id,
          guestId: guest.guestId,
          value: 1,
          createdAt: now,
        },
      );
      ops += 1;
    }
    added.push(track);
    existingIds.add(item.id);

    if (ops >= 400) {
      await flush();
    }
  }
  await flush();

  if (
    added.length === 0 &&
    cooldownSkipped.length > 0 &&
    skipped.length === 0
  ) {
    return NextResponse.json(
      {
        error: `That track was played recently. Try again in about ${cooldownMinutes} minute${cooldownMinutes === 1 ? "" : "s"}.`,
        code: "TRACK_COOLDOWN",
        trackCooldownMinutes: cooldownMinutes,
        skipped: cooldownSkipped,
      },
      { status: 409 },
    );
  }

  if (added.length > 0) {
    await touchPartyActivity(partyId, now);
  }

  return NextResponse.json({
    tracks: added,
    track: added[0] ?? null,
    alreadyQueued: added.length === 0 && skipped.length > 0,
    skipped,
    cooldownSkipped,
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const session = await requireHostSessionOr401();
  if (session instanceof NextResponse) return session;

  const partyId = (await context.params)["party-id"];
  const trackId = request.nextUrl.searchParams.get("trackId");
  if (!trackId) {
    return jsonError("trackId required", 400);
  }

  const owner = await requirePartyOwner(partyId, session.spotifyId);
  if ("error" in owner) return owner.error;
  const { party, ref: partyRef } = owner;

  const db = getAdminDb();
  const votes = await partyRef
    .collection("votes")
    .where("trackId", "==", trackId)
    .get();
  const batch = db.batch();
  const now = Date.now();
  votes.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(partyRef.collection("tracks").doc(trackId));

  if (party.nowPlayingTrackId === trackId || party.nowPlaying?.id === trackId) {
    batch.set(
      partyRef,
      {
        nowPlayingTrackId: null,
        nowPlaying: null,
        isPaused: true,
        playbackPositionMs: 0,
        playbackStartedAt: null,
        playbackUpdatedAt: now,
        lastActivityAt: now,
      },
      { merge: true },
    );
  } else {
    batch.set(partyRef, { lastActivityAt: now }, { merge: true });
  }
  await batch.commit();

  return NextResponse.json({ ok: true });
}
