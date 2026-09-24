import {
  getDeviceStatus,
  linkDevice,
  registerDevice,
} from "@/lib/party/device-control";
import {
  jsonError,
  requireHostSessionOr401,
  requirePlaybackControllerParty,
} from "@/lib/party/http";
import {
  pausePartyPlayback,
  playPartyPlayback,
  skipPartyPlayback,
  syncPlaybackState,
} from "@/lib/party/playback-control";
import { getPlaybackState } from "@/lib/spotify/api";
import { getHostAccessToken } from "@/lib/spotify/host-tokens";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ "party-id": string }> },
) {
  const session = await requireHostSessionOr401();
  if (session instanceof NextResponse) return session;

  const partyId = (await context.params)["party-id"];
  const result = await requirePlaybackControllerParty(
    partyId,
    session.spotifyId,
  );
  if ("error" in result) return result.error;
  const { party, ref } = result;

  const body = (await request.json()) as {
    action?:
      | "play"
      | "pause"
      | "skip"
      | "register-device"
      | "device-status"
      | "link-device"
      | "sync-playback";
    deviceId?: string;
    positionMs?: number;
    isPaused?: boolean;
  };

  try {
    const accessToken = await getHostAccessToken(session.spotifyId);

    if (body.action === "device-status") {
      if (!body.deviceId) {
        return jsonError("deviceId required", 400);
      }
      const status = await getDeviceStatus({
        party,
        accessToken,
        deviceId: body.deviceId,
      });
      return NextResponse.json(status);
    }

    if (body.action === "sync-playback") {
      const synced = await syncPlaybackState({
        party,
        ref,
        accessToken,
        positionMs: body.positionMs,
        isPaused: body.isPaused,
        getPlaybackState,
      });
      return NextResponse.json(synced);
    }

    if (body.action === "register-device") {
      if (!body.deviceId) {
        return jsonError("deviceId required", 400);
      }
      const registered = await registerDevice({
        party,
        ref,
        deviceId: body.deviceId,
      });
      return NextResponse.json(registered);
    }

    if (body.action === "link-device") {
      if (!body.deviceId) {
        return jsonError("deviceId required", 400);
      }
      const linked = await linkDevice({
        party,
        ref,
        accessToken,
        deviceId: body.deviceId,
      });
      return NextResponse.json(linked);
    }

    const deviceId = body.deviceId || party.deviceId;
    if (!deviceId) {
      return jsonError(
        "No playback device — open the host page in a supported browser",
        400,
      );
    }

    if (body.action === "pause") {
      await pausePartyPlayback({
        party,
        ref,
        accessToken,
        deviceId,
        positionMs: body.positionMs,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "play") {
      const played = await playPartyPlayback({
        party,
        ref,
        partyId,
        accessToken,
        deviceId,
      });
      if ("error" in played) {
        return jsonError(played.error, played.status);
      }
      return NextResponse.json({ ok: true, trackId: played.trackId });
    }

    if (body.action === "skip") {
      const skipped = await skipPartyPlayback({
        party,
        ref,
        partyId,
        accessToken,
        deviceId,
      });
      return NextResponse.json({ ok: true, trackId: skipped.trackId });
    }

    return jsonError("Unknown action", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Control failed";
    return jsonError(message, 500);
  }
}
