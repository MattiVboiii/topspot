"use client";

import { useEffect, useState } from "react";

/**
 * Wall-clock for scrubbers. Always starts at Date.now() so join/mid-song
 * shows real elapsed progress (baseline + now - playbackUpdatedAt), and
 * recalibrates when the tab is focused again after background throttling.
 */
export function usePlaybackNow(opts: {
  active: boolean;
  /** When true, skip ticking — caller uses a live SDK position instead. */
  hasLivePosition?: boolean;
}): number {
  const { active, hasLivePosition = false } = opts;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active || hasLivePosition) return;

    const stamp = () => setNowMs(Date.now());
    stamp();

    const id = window.setInterval(stamp, 250);
    const onVisible = () => {
      if (document.visibilityState === "visible") stamp();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", stamp);
    window.addEventListener("pageshow", stamp);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", stamp);
      window.removeEventListener("pageshow", stamp);
    };
  }, [active, hasLivePosition]);

  return nowMs;
}
