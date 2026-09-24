import { isErrorResponse, requireGuestId } from "@/lib/auth/guest";
import { getHostSession } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/firebase/admin";
import { touchPartyActivity } from "@/lib/party/inactivity";
import { sortPartyQueue } from "@/lib/party/queue";
import type {
  Party,
  PartyGuest,
  PartyHistoryEntry,
  PartyTrack,
  SpotifySearchTrack,
  TrackSource,
} from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
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
  context: { params: Promise<{ partyId: string }> },
) {
  const guest = await requireGuestId(request);
  if (isErrorResponse(guest)) return guest;

  const { partyId } = await context.params;
  const body = (await request.json()) as {
    track?: SpotifySearchTrack;
    tracks?: SpotifySearchTrack[];
    source?: TrackSource;
  };

  const source: TrackSource =
    body.source === "fallback" ? "fallback" : "request";

  const incoming = body.tracks?.length
    ? body.tracks
    : body.track
      ? [body.track]
      : [];

  if (!incoming.length || incoming.some((t) => !t?.id || !t?.uri)) {
    return NextResponse.json({ error: "Invalid track" }, { status: 400 });
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

  if (source === "fallback") {
    const session = await getHostSession();
    if (!session || session.spotifyId !== party.hostSpotifyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
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

  const ids = incoming.map((t) => t.id);
  const existingIds = new Set<string>();
  if (ids.length > 0) {
    const existingSnaps = await db.getAll(
      ...ids.map((id) => partyRef.collection("tracks").doc(id)),
    );
    existingSnaps.filter((s) => s.exists).forEach((s) => existingIds.add(s.id));
  }

  const cooldownMinutes =
    typeof party.trackCooldownMinutes === "number"
      ? party.trackCooldownMinutes
      : 30;
  const cooldownMs = Math.max(0, cooldownMinutes) * 60_000;
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
    const maxActive =
      typeof party.maxActiveRequestsPerGuest === "number"
        ? party.maxActiveRequestsPerGuest
        : 3;
    if (maxActive > 0) {
      const queueSnap = await partyRef.collection("tracks").get();
      const activeCount = queueSnap.docs.filter((doc) => {
        const t = doc.data() as PartyTrack;
        return (
          (t.source === "request" || !t.source) && t.addedBy === guest.guestId
        );
      }).length;
      const wouldAdd = incoming.filter(
        (item) =>
          !existingIds.has(item.id) &&
          party.nowPlaying?.id !== item.id &&
          party.nowPlayingTrackId !== item.id &&
          !onCooldown.has(item.id),
      ).length;
      if (activeCount + wouldAdd > maxActive) {
        return NextResponse.json(
          {
            error: `You can have at most ${maxActive} active request${maxActive === 1 ? "" : "s"} in the queue`,
            code: "GUEST_REQUEST_LIMIT",
            maxActiveRequestsPerGuest: maxActive,
            activeCount,
          },
          { status: 429 },
        );
      }
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
      existingIds.has(item.id) ||
      party.nowPlaying?.id === item.id ||
      party.nowPlayingTrackId === item.id
    ) {
      skipped.push(item.id);
      continue;
    }

    if (source === "request" && onCooldown.has(item.id)) {
      cooldownSkipped.push(item.id);
      continue;
    }

    const track: PartyTrack = {
      id: item.id,
      name: item.name,
      artists: item.artists,
      albumName: item.albumName,
      albumArtUrl: item.albumArtUrl,
      durationMs: item.durationMs,
      uri: item.uri,
      source,
      voteCount: source === "request" ? 1 : 0,
      upVoteCount: source === "request" ? 1 : 0,
      downVoteCount: 0,
      addedBy: guest.guestId,
      addedByName: guestData.displayName,
      addedAt: now + i,
      isPlaying: false,
    };

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
  context: { params: Promise<{ partyId: string }> },
) {
  const session = await getHostSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { partyId } = await context.params;
  const trackId = request.nextUrl.searchParams.get("trackId");
  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }

  const db = getAdminDb();
  const partyRef = db.collection("parties").doc(partyId);
  const partySnap = await partyRef.get();
  if (!partySnap.exists) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const party = partySnap.data() as Party;
  if (party.hostSpotifyId !== session.spotifyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
