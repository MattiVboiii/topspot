"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 45_000;
const SEARCHING_DEBOUNCE_MS = 800;

type Options = {
  partyId: string | null;
  enabled: boolean;
  isSearching: boolean;
  getIdToken: () => Promise<string>;
};

/**
 * Keeps guest lastSeenAt fresh while the tab is visible, marks leave on hide/close,
 * and syncs isSearching for the host guest list.
 */
export function useGuestPresence({
  partyId,
  enabled,
  isSearching,
  getIdToken,
}: Options) {
  const getIdTokenRef = useRef(getIdToken);
  const tokenRef = useRef<string | null>(null);
  const searchingRef = useRef(isSearching);
  const lastHeartbeatAtRef = useRef(0);

  useEffect(() => {
    getIdTokenRef.current = getIdToken;
  }, [getIdToken]);

  useEffect(() => {
    searchingRef.current = isSearching;
  }, [isSearching]);

  useEffect(() => {
    if (!enabled || !partyId) return;

    let cancelled = false;
    let intervalId: number | undefined;

    const post = async (
      action: "heartbeat" | "leave",
      searching = searchingRef.current,
    ) => {
      try {
        let token = tokenRef.current;
        if (!token) {
          token = await getIdTokenRef.current();
          tokenRef.current = token;
        }
        const res = await fetch(`/api/parties/${partyId}/guests`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            action === "leave"
              ? { action: "leave" }
              : { action: "heartbeat", isSearching: searching },
          ),
          keepalive: action === "leave",
        });
        if (res.status === 401) {
          tokenRef.current = null;
        }
        if (action === "heartbeat" && res.ok) {
          lastHeartbeatAtRef.current = Date.now();
        }
      } catch {
        // ignore presence failures
      }
    };

    const start = () => {
      if (intervalId) window.clearInterval(intervalId);
      void post("heartbeat");
      intervalId = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void post("heartbeat");
      }, HEARTBEAT_MS);
    };

    const onVisibility = () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        if (intervalId) window.clearInterval(intervalId);
        intervalId = undefined;
        void post("leave");
        return;
      }
      start();
    };

    const onPageHide = () => {
      void post("leave");
    };

    if (document.visibilityState === "visible") {
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      void post("leave");
    };
  }, [enabled, partyId]);

  const prevSearchingRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled || !partyId) {
      prevSearchingRef.current = null;
      return;
    }
    if (document.visibilityState !== "visible") return;
    if (prevSearchingRef.current === isSearching) return;
    const isFirst = prevSearchingRef.current === null;
    prevSearchingRef.current = isSearching;
    // First sync is covered by the interval heartbeat start().
    if (isFirst) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let token = tokenRef.current;
          if (!token) {
            token = await getIdTokenRef.current();
            tokenRef.current = token;
          }
          if (cancelled) return;
          const res = await fetch(`/api/parties/${partyId}/guests`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "heartbeat",
              isSearching,
            }),
          });
          if (res.status === 401) tokenRef.current = null;
          if (res.ok) lastHeartbeatAtRef.current = Date.now();
        } catch {
          // ignore
        }
      })();
    }, SEARCHING_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, partyId, isSearching]);
}
