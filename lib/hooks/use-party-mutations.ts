"use client";

import type { SpotifySearchTrack } from "@/lib/types/party";
import { useCallback, useState } from "react";

type GetIdToken = () => Promise<string>;

export function usePartyMutations(
  partyId: string | null,
  getIdToken: GetIdToken,
) {
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getIdToken();
      return fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    },
    [getIdToken],
  );

  const onAdd = useCallback(
    async (track: SpotifySearchTrack) => {
      if (!partyId) return;
      const res = await authedFetch(`/api/parties/${partyId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ track, source: "request" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not add track");
      setMyVotes((prev) => ({ ...prev, [track.id]: 1 }));
    },
    [authedFetch, partyId],
  );

  const onVote = useCallback(
    async (trackId: string, action: "up" | "down") => {
      if (!partyId) return;
      const res = await authedFetch(`/api/parties/${partyId}/votes`, {
        method: "POST",
        body: JSON.stringify({ trackId, action }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { myVote?: 0 | 1 | -1 };
      setMyVotes((prev) => {
        const next = { ...prev };
        if (!data.myVote) delete next[trackId];
        else next[trackId] = data.myVote;
        return next;
      });
    },
    [authedFetch, partyId],
  );

  const loadVotes = useCallback(
    async (token?: string) => {
      if (!partyId) return;
      const authToken = token ?? (await getIdToken());
      const votesRes = await fetch(`/api/parties/${partyId}/votes`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!votesRes.ok) return;
      const data = (await votesRes.json()) as {
        votes?: Record<string, 1 | -1>;
      };
      setMyVotes(data.votes ?? {});
    },
    [getIdToken, partyId],
  );

  return {
    myVotes,
    setMyVotes,
    authedFetch,
    onAdd,
    onVote,
    loadVotes,
  };
}
