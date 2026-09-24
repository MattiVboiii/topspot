import { requireHostSessionOr401, requireParty } from "@/lib/party/http";
import { isPartyOwner } from "@/lib/party/ownership";
import { pausePlayback } from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import type { PartyGuest } from "@/lib/types/party";
import { NextRequest, NextResponse } from "next/server";

/**
 * Music-control handoff (ownership never changes).
 * - assign: owner offers music control to a Premium guest
 * - accept: that guest takes playback (owner stays party owner)
 * - reclaim: owner takes music control back
 * - reassign: owner points music control at another guest (or clears pending)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const session = await requireHostSessionOr401();
  if (session instanceof NextResponse) return session;

  const partyId = (await context.params)["party-id"];
  const body = (await request.json()) as {
    guestId?: string;
    action?: "assign" | "accept" | "reclaim" | "initiate";
  };

  // Back-compat: older UI sent "initiate"
  const action =
    body.action === "initiate" ? "assign" : (body.action ?? "assign");

  const partyResult = await requireParty(partyId);
  if ("error" in partyResult) return partyResult.error;
  const { party, ref: partyRef } = partyResult;
  async function pauseCurrentDevice(
    spotifyId: string,
    deviceId: string | null,
  ) {
    if (!deviceId) return;
    try {
      const token = await getHostAccessToken(spotifyId);
      await pausePlayback(token, deviceId).catch(() => undefined);
    } catch {
      // best-effort
    }
  }

  if (action === "accept") {
    if (!party.pendingPlaybackGuestId) {
      return NextResponse.json(
        { error: "No pending music-control offer" },
        { status: 400 },
      );
    }

    const guestSnap = await partyRef
      .collection("guests")
      .doc(party.pendingPlaybackGuestId)
      .get();
    if (!guestSnap.exists) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }
    const guest = guestSnap.data() as PartyGuest;
    if (!guest.spotifyId || !guest.isPremium) {
      return NextResponse.json(
        { error: "Guest must link Spotify Premium to accept" },
        { status: 400 },
      );
    }
    if (session.spotifyId !== guest.spotifyId) {
      return NextResponse.json(
        { error: "Sign in with the invited Spotify account" },
        { status: 403 },
      );
    }

    const previousController = party.playbackSpotifyId || party.hostSpotifyId;
    await pauseCurrentDevice(previousController, party.deviceId);

    await partyRef.set(
      {
        // Ownership stays with hostSpotifyId
        playbackSpotifyId: guest.spotifyId,
        playbackGuestId: guest.id,
        pendingPlaybackGuestId: null,
        deviceId: null,
        isPaused: true,
        playbackUpdatedAt: Date.now(),
        lastActivityAt: Date.now(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      partyId,
      playbackSpotifyId: guest.spotifyId,
      role: "playback",
    });
  }

  if (action === "reclaim") {
    if (!isPartyOwner(party, session.spotifyId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const previousController = party.playbackSpotifyId || party.hostSpotifyId;
    if (previousController !== session.spotifyId) {
      await pauseCurrentDevice(previousController, party.deviceId);
    }

    await partyRef.set(
      {
        playbackSpotifyId: party.hostSpotifyId,
        playbackGuestId: null,
        pendingPlaybackGuestId: null,
        deviceId: null,
        isPaused: true,
        playbackUpdatedAt: Date.now(),
        lastActivityAt: Date.now(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      playbackSpotifyId: party.hostSpotifyId,
      role: "owner",
    });
  }

  // assign
  if (!isPartyOwner(party, session.spotifyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!body.guestId) {
    return NextResponse.json({ error: "guestId required" }, { status: 400 });
  }

  const guestSnap = await partyRef.collection("guests").doc(body.guestId).get();
  if (!guestSnap.exists) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }
  const guest = guestSnap.data() as PartyGuest;
  if (!guest.spotifyId || !guest.isPremium) {
    return NextResponse.json(
      {
        error: "Guest must link Spotify Premium before taking music control",
      },
      { status: 400 },
    );
  }
  if (guest.spotifyId === party.hostSpotifyId) {
    return NextResponse.json(
      { error: "You already own this party — use Take back control if needed" },
      { status: 400 },
    );
  }

  await partyRef.set(
    {
      pendingPlaybackGuestId: body.guestId,
      playbackUpdatedAt: Date.now(),
      lastActivityAt: Date.now(),
    },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    pendingPlaybackGuestId: body.guestId,
  });
}
