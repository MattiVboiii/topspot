"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }
}

export function useSpotifyPlayer(enabled: boolean, partyId: string) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const playerRef = useRef<Spotify.Player | null>(null);

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
    if (!enabled || !partyId) return;
    if (typeof window === "undefined" || !window.Spotify) {
      return;
    }

    let cancelled = false;
    let player: Spotify.Player | null = null;
    let becameReady = false;
    const timeout = window.setTimeout(() => {
      if (cancelled || becameReady) return;
      setError(
        "Player connection timed out. Refresh the page, use Chrome/Edge/Firefox, and ensure Premium is active.",
      );
      setStatus("error");
    }, 20_000);

    async function init() {
      setStatus("connecting");
      setError(null);
      setReady(false);

      try {
        player = new window.Spotify.Player({
          name: "Topspot Party Player",
          getOAuthToken,
          volume: 0.8,
        });
        playerRef.current = player;

        player.addListener("ready", ({ device_id }) => {
          if (cancelled) return;
          becameReady = true;
          window.clearTimeout(timeout);
          setDeviceId(device_id);
          setReady(true);
          setStatus("ready");
          setError(null);
          void fetch(`/api/parties/${partyId}/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "register-device",
              deviceId: device_id,
            }),
          });
        });

        player.addListener("not_ready", () => {
          if (cancelled) return;
          setReady(false);
          setStatus("not_ready");
        });

        player.addListener("initialization_error", ({ message }) => {
          if (cancelled) return;
          window.clearTimeout(timeout);
          setError(message);
          setStatus("init_error");
        });
        player.addListener("authentication_error", ({ message }) => {
          if (cancelled) return;
          window.clearTimeout(timeout);
          setError(message);
          setStatus("auth_error");
        });
        player.addListener("account_error", ({ message }) => {
          if (cancelled) return;
          window.clearTimeout(timeout);
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
          if (!state || cancelled) return;
          const ended =
            state.paused &&
            state.position === 0 &&
            state.track_window.previous_tracks.length > 0;
          if (!ended) return;
          void fetch(`/api/parties/${partyId}/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "skip" }),
          });
        });

        const connected = await player.connect();
        if (cancelled) return;
        if (!connected) {
          window.clearTimeout(timeout);
          setError("Could not connect Spotify player");
          setStatus("connect_failed");
        }
      } catch (err) {
        if (cancelled) return;
        window.clearTimeout(timeout);
        setError(err instanceof Error ? err.message : "Player init failed");
        setStatus("error");
      }
    }

    void init();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      player?.disconnect();
      playerRef.current = null;
    };
  }, [enabled, partyId, getOAuthToken]);

  return { deviceId, ready, error, status };
}
