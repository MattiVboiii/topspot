import {
  getPlaybackState,
  getPlayerDevices,
  startPlayback,
  transferPlayback,
} from "@/lib/spotify/api";
import type { Party } from "@/lib/types/party";
import type { DocumentReference } from "firebase-admin/firestore";

export async function getDeviceStatus(opts: {
  party: Party;
  accessToken: string;
  deviceId: string;
}) {
  const [playback, devices] = await Promise.all([
    getPlaybackState(opts.accessToken),
    getPlayerDevices(opts.accessToken),
  ]);
  const browserDevice = devices.find((d) => d.id === opts.deviceId);
  const activeFromList = devices.find((d) => d.isActive);
  const activeDeviceId = playback?.deviceId ?? activeFromList?.id ?? null;
  const linked = Boolean(
    browserDevice?.isActive ||
      (activeDeviceId && activeDeviceId === opts.deviceId) ||
      (opts.party.deviceId === opts.deviceId && browserDevice),
  );
  return {
    ok: true as const,
    linked,
    browserDeviceId: opts.deviceId,
    activeDeviceId,
    activeDeviceName:
      playback?.deviceName ??
      activeFromList?.name ??
      browserDevice?.name ??
      null,
    isPlaying: playback?.isPlaying ?? false,
    progressMs: playback?.progressMs ?? null,
    partyDeviceId: opts.party.deviceId,
  };
}

export async function registerDevice(opts: {
  party: Party;
  ref: DocumentReference;
  deviceId: string;
}) {
  if (opts.party.deviceId !== opts.deviceId) {
    await opts.ref.set({ deviceId: opts.deviceId }, { merge: true });
  }
  return {
    ok: true as const,
    deviceId: opts.deviceId,
    linked: false as const,
  };
}

export async function linkDevice(opts: {
  party: Party;
  ref: DocumentReference;
  accessToken: string;
  deviceId: string;
}) {
  const { party, ref, accessToken, deviceId } = opts;
  if (party.deviceId !== deviceId) {
    await ref.set(
      { deviceId, lastActivityAt: Date.now() },
      { merge: true },
    );
  }

  const [playback, devices] = await Promise.all([
    getPlaybackState(accessToken),
    getPlayerDevices(accessToken),
  ]);
  const browserDevice = devices.find((d) => d.id === deviceId);
  const alreadyActive =
    playback?.deviceId === deviceId || Boolean(browserDevice?.isActive);

  if (!alreadyActive) {
    try {
      const shouldPlay = Boolean(party.nowPlaying && !party.isPaused);
      await transferPlayback(accessToken, deviceId, shouldPlay);
      if (shouldPlay && !playback && party.nowPlaying) {
        await startPlayback(
          accessToken,
          deviceId,
          [party.nowPlaying.uri],
          party.playbackPositionMs || 0,
        );
      }
    } catch {
      return {
        ok: true as const,
        deviceId,
        linked: false as const,
        pending: true as const,
      };
    }
  }

  return {
    ok: true as const,
    deviceId,
    linked: true as const,
  };
}
