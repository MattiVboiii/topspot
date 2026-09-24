"use client";

import { shouldWritePlaybackSync } from "@/lib/party/queue";
import type { Party } from "@/lib/types/party";
import { useCallback, useEffect, useRef } from "react";

type Options = {
  partyId: string;
  party: Party | null | undefined;
  isController: boolean;
  nowPlayingId: string | null;
  sdkActiveDevice: boolean;
  sdkPaused: boolean;
  positionMs: number;
};

export function useHostPlaybackSync({
  partyId,
  party,
  isController,
  nowPlayingId,
  sdkActiveDevice,
  sdkPaused,
  positionMs,
}: Options) {
  const syncInFlightRef = useRef(false);
  const lastSyncedPausedRef = useRef<boolean | null>(null);
  const sdkActiveDeviceRef = useRef(false);
  const sdkPausedRef = useRef(true);
  const positionMsRef = useRef(0);
  const partyPausedRef = useRef(true);
  const partyRef = useRef(party);

  useEffect(() => {
    sdkActiveDeviceRef.current = sdkActiveDevice;
  }, [sdkActiveDevice]);

  useEffect(() => {
    sdkPausedRef.current = sdkPaused;
  }, [sdkPaused]);

  useEffect(() => {
    positionMsRef.current = positionMs;
  }, [positionMs]);

  useEffect(() => {
    partyRef.current = party;
  }, [party]);

  useEffect(() => {
    partyPausedRef.current = Boolean(party?.isPaused || !party?.nowPlaying);
  }, [party?.isPaused, party?.nowPlaying]);

  const pushPlaybackSync = useCallback(async () => {
    if (!isController || !nowPlayingId || syncInFlightRef.current) return;
    const currentParty = partyRef.current;
    if (!currentParty?.nowPlaying || !sdkActiveDeviceRef.current) return;

    const snapshot = {
      positionMs: positionMsRef.current,
      isPaused: sdkPausedRef.current,
    };
    // Transfer/link often emits paused@0 — ignore those.
    if (
      snapshot.isPaused &&
      snapshot.positionMs < 400 &&
      !partyPausedRef.current
    ) {
      return;
    }
    if (!shouldWritePlaybackSync(currentParty, snapshot)) return;

    syncInFlightRef.current = true;
    try {
      await fetch(`/api/parties/${partyId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync-playback",
          positionMs: snapshot.positionMs,
          isPaused: snapshot.isPaused,
        }),
      });
      lastSyncedPausedRef.current = snapshot.isPaused;
    } catch {
      // best-effort
    } finally {
      syncInFlightRef.current = false;
    }
  }, [isController, nowPlayingId, partyId]);

  useEffect(() => {
    if (!isController || !nowPlayingId || !sdkActiveDevice) {
      if (!sdkActiveDevice) lastSyncedPausedRef.current = null;
      return;
    }
    if (lastSyncedPausedRef.current === sdkPaused) return;
    lastSyncedPausedRef.current = sdkPaused;
    void pushPlaybackSync();
  }, [
    isController,
    nowPlayingId,
    sdkActiveDevice,
    sdkPaused,
    pushPlaybackSync,
  ]);

  return { partyPausedRef, positionMsRef, sdkActiveDeviceRef, sdkPausedRef };
}
