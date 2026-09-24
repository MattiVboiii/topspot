"use client";

import type { PartyTrack } from "@/lib/types/party";
import { useCallback, useEffect, useRef, useState } from "react";

export type DisplayUpvoteToast = {
  id: string;
  trackId: string;
  trackName: string;
  artists: string;
  albumArtUrl: string | null;
};

export const DISPLAY_UPVOTE_TOAST_MAX = 3;
const BUMP_MS = 900;

export function useDisplayUpvoteFeed(tracks: PartyTrack[]) {
  const [toasts, setToasts] = useState<DisplayUpvoteToast[]>([]);
  const [bumpedIds, setBumpedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const prevCountsRef = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const prev = prevCountsRef.current;
    const next = new Map<string, number>();
    const newToasts: DisplayUpvoteToast[] = [];
    const bumped: string[] = [];

    for (const track of tracks) {
      const up = track.upVoteCount ?? track.voteCount ?? 0;
      next.set(track.id, up);

      if (!prev) continue;
      const before = prev.get(track.id);
      if (before === undefined || up <= before) continue;

      bumped.push(track.id);
      newToasts.push({
        id: `${track.id}-${up}-${Date.now()}`,
        trackId: track.id,
        trackName: track.name,
        artists: track.artists,
        albumArtUrl: track.albumArtUrl,
      });
    }

    prevCountsRef.current = next;
    if (bumped.length === 0) return;

    const applyTimer = window.setTimeout(() => {
      setBumpedIds((current) => {
        const merged = new Set(current);
        bumped.forEach((id) => merged.add(id));
        return merged;
      });
      setToasts((current) => [...current, ...newToasts]);
    }, 0);

    const bumpTimer = window.setTimeout(() => {
      setBumpedIds((current) => {
        const merged = new Set(current);
        bumped.forEach((id) => merged.delete(id));
        return merged;
      });
    }, BUMP_MS);

    return () => {
      window.clearTimeout(applyTimer);
      window.clearTimeout(bumpTimer);
    };
  }, [tracks]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((item) => item.id !== toastId));
  }, []);

  return { toasts, bumpedIds, dismissToast };
}
