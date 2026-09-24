"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SKIP_COOLDOWN_MS = 8_000;
/** Ignore end-of-track signals until we've actually been playing for a bit. */
const MIN_PLAYED_MS_BEFORE_END = 3_000;

function waitForSpotifySdk(timeoutMs = 20_000): Promise<void> {
  if (typeof window !== "undefined" && window.Spotify) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("spotify-sdk-ready", onReady);
      reject(new Error("Spotify SDK failed to load"));
    }, timeoutMs);
    const onReady = () => {
      if (!window.Spotify) return;
      window.clearTimeout(timer);
      window.removeEventListener("spotify-sdk-ready", onReady);
      resolve();
    };
    window.addEventListener("spotify-sdk-ready", onReady);
  });
}

const IDLE_PLAYER = {
  deviceId: null as string | null,
  ready: false,
  error: null as string | null,
  status: "idle",
  positionMs: 0,
  paused: true,
  isActiveDevice: false,
};

export function useSpotifyPlayer(enabled: boolean, partyId: string) {
  const sessionKey = enabled && partyId ? partyId : null;
  const [session, setSession] = useState<string | null>(sessionKey);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [positionMs, setPositionMs] = useState(0);
  const [paused, setPaused] = useState(true);
  const [isActiveDevice, setIsActiveDevice] = useState(false);
  const playerRef = useRef<Spotify.Player | null>(null);
  const skipLockRef = useRef(false);
  const lastSkipAtRef = useRef(0);
  const registeredDeviceRef = useRef<string | null>(null);
  const sawMeaningfulPlayRef = useRef(false);
  const lastSdkPositionRef = useRef({ position: 0, at: 0, paused: true });

  if (session !== sessionKey) {
    setSession(sessionKey);
    if (sessionKey === null) {
      setDeviceId(IDLE_PLAYER.deviceId);
      setReady(IDLE_PLAYER.ready);
      setError(IDLE_PLAYER.error);
      setStatus(IDLE_PLAYER.status);
      setPositionMs(IDLE_PLAYER.positionMs);
      setPaused(IDLE_PLAYER.paused);
      setIsActiveDevice(IDLE_PLAYER.isActiveDevice);
    }
  }

  const getOAuthToken = useCallback((cb: (token: string) => void) => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/spotify/token");
        const data = (await res.json()) as {
          accessToken?: string;
          error?: string;
        };
        if (!res.ok || !data.accessToken) {
          throw new Error(data.error || "Could not get Spotify token");
        }
        cb(data.accessToken);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not get Spotify token";
        setError(message);
        setStatus("token_error");
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    let cancelled = false;
    let player: Spotify.Player | null = null;
    let becameReady = false;
    let localTick: number | undefined;
    let timeout: number | undefined;
    let focusCleanup: (() => void) | undefined;

    async function init() {
      setStatus("loading_sdk");
      setError(null);
      setReady(false);
      setDeviceId(null);
      registeredDeviceRef.current = null;
      sawMeaningfulPlayRef.current = false;
      setIsActiveDevice(false);
      setPaused(true);
      setPositionMs(0);

      try {
        await waitForSpotifySdk();
        if (cancelled) return;

        setStatus("connecting");

        timeout = window.setTimeout(() => {
          if (cancelled || becameReady) return;
          setError(
            "Player connection timed out. Refresh the page, use Chrome/Edge/Firefox, and ensure Premium is active.",
          );
          setStatus("error");
        }, 20_000);

        player = new window.Spotify.Player({
          name: "TopSpot Party Player",
          getOAuthToken,
          volume: 0.8,
        });
        playerRef.current = player;

        player.addListener("ready", ({ device_id }) => {
          if (cancelled) return;
          becameReady = true;
          if (timeout !== undefined) window.clearTimeout(timeout);
          setDeviceId(device_id);
          setReady(true);
          setStatus("ready");
          setError(null);
          if (registeredDeviceRef.current === device_id) return;
          registeredDeviceRef.current = device_id;
          window.setTimeout(() => {
            if (cancelled || registeredDeviceRef.current !== device_id) return;
            void fetch(`/api/parties/${sessionKey}/control`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "register-device",
                deviceId: device_id,
              }),
            });
          }, 500);
        });
        player.addListener("not_ready", () => {
          if (cancelled) return;
          setReady(false);
          setIsActiveDevice(false);
          setStatus("not_ready");
        });

        player.addListener("initialization_error", ({ message }) => {
          if (cancelled) return;
          if (timeout !== undefined) window.clearTimeout(timeout);
          setError(message);
          setStatus("init_error");
        });
        player.addListener("authentication_error", ({ message }) => {
          if (cancelled) return;
          if (timeout !== undefined) window.clearTimeout(timeout);
          setError(message);
          setStatus("auth_error");
        });
        player.addListener("account_error", ({ message }) => {
          if (cancelled) return;
          if (timeout !== undefined) window.clearTimeout(timeout);
          setError(
            message || "Spotify Premium is required for browser playback",
          );
          setStatus("account_error");
        });

        player.addListener("playback_error", ({ message }) => {
          if (cancelled) return;
          setError(message);
        });

        player.addListener("player_state_changed", (state) => {
          if (cancelled) return;
          setIsActiveDevice(Boolean(state?.track_window.current_track));
          if (!state) {
            setPaused(true);
            return;
          }
          lastSdkPositionRef.current = {
            position: state.position,
            at: performance.now(),
            paused: state.paused,
          };
          setPositionMs(state.position);
          setPaused(state.paused);

          if (!state.paused && state.position >= MIN_PLAYED_MS_BEFORE_END) {
            sawMeaningfulPlayRef.current = true;
          }

          // Transfer/link often emits paused@0 with previous_tracks — ignore those.
          const ended =
            sawMeaningfulPlayRef.current &&
            state.paused &&
            state.position === 0 &&
            state.track_window.previous_tracks.length > 0;
          if (!ended) return;

          const now = Date.now();
          if (skipLockRef.current) return;
          if (now - lastSkipAtRef.current < SKIP_COOLDOWN_MS) return;

          sawMeaningfulPlayRef.current = false;
          skipLockRef.current = true;
          lastSkipAtRef.current = now;
          void fetch(`/api/parties/${sessionKey}/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "skip" }),
          }).finally(() => {
            window.setTimeout(() => {
              skipLockRef.current = false;
            }, SKIP_COOLDOWN_MS);
          });
        });

        const connected = await player.connect();
        if (cancelled) return;
        if (!connected) {
          if (timeout !== undefined) window.clearTimeout(timeout);
          setError("Could not connect Spotify player");
          setStatus("connect_failed");
          return;
        }
        localTick = window.setInterval(() => {
          const snap = lastSdkPositionRef.current;
          if (snap.paused) return;
          setPositionMs(
            snap.position + Math.max(0, performance.now() - snap.at),
          );
        }, 250);

        const refreshFromSdk = () => {
          if (document.visibilityState !== "visible") return;
          void player?.getCurrentState().then((state) => {
            if (cancelled || !state) return;
            lastSdkPositionRef.current = {
              position: state.position,
              at: performance.now(),
              paused: state.paused,
            };
            setPositionMs(state.position);
            setPaused(state.paused);
            setIsActiveDevice(Boolean(state.track_window.current_track));
          });
        };
        document.addEventListener("visibilitychange", refreshFromSdk);
        window.addEventListener("focus", refreshFromSdk);
        focusCleanup = () => {
          document.removeEventListener("visibilitychange", refreshFromSdk);
          window.removeEventListener("focus", refreshFromSdk);
        };
      } catch (err) {
        if (cancelled) return;
        if (timeout !== undefined) window.clearTimeout(timeout);
        const message =
          err instanceof Error ? err.message : "Player init failed";
        setError(message);
        setStatus(
          message === "Spotify SDK failed to load" ? "init_error" : "error",
        );
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (localTick) window.clearInterval(localTick);
      focusCleanup?.();
      registeredDeviceRef.current = null;
      player?.disconnect();
      playerRef.current = null;
    };
  }, [sessionKey, getOAuthToken]);

  return {
    deviceId,
    ready,
    error,
    status,
    positionMs,
    paused,
    isActiveDevice,
  };
}
