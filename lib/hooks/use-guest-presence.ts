"use client";

import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 25_000;

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
        if (!token || action === "heartbeat") {
          token = await getIdTokenRef.current();
          tokenRef.current = token;
        }
        await fetch(`/api/parties/${partyId}/guests`, {
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

  useEffect(() => {
    if (!enabled || !partyId) return;
    if (document.visibilityState !== "visible") return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getIdTokenRef.current();
        tokenRef.current = token;
        if (cancelled) return;
        await fetch(`/api/parties/${partyId}/guests`, {
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
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, partyId, isSearching]);
}
