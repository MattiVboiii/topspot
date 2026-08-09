"use client";

import { getClientDb, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  normalizeParty,
  normalizeTrack,
  sortPartyQueue,
} from "@/lib/party/queue";
import type { Party, PartyGuest, PartyTrack } from "@/lib/types/party";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

export function usePartyRealtime(partyId: string | null) {
  const configured = isFirebaseConfigured();
  const [party, setParty] = useState<Party | null>(null);
  const [tracks, setTracks] = useState<PartyTrack[]>([]);
  const [guests, setGuests] = useState<PartyGuest[]>([]);
  const [error, setError] = useState<string | null>(
    configured ? null : "Firebase is not configured",
  );

  useEffect(() => {
    if (!partyId || !configured) return;

    const db = getClientDb();
    const unsubParty = onSnapshot(
      doc(db, "parties", partyId),
      (snap) => {
        if (!snap.exists()) {
          setParty(null);
          return;
        }
        setParty(normalizeParty(snap.data() as Party));
      },
      (err) => setError(err.message),
    );

    const unsubTracks = onSnapshot(
      collection(db, "parties", partyId, "tracks"),
      (snap) => {
        setTracks(snap.docs.map((d) => normalizeTrack(d.data() as PartyTrack)));
      },
      (err) => setError(err.message),
    );

    const unsubGuests = onSnapshot(
      collection(db, "parties", partyId, "guests"),
      (snap) => {
        const list = snap.docs.map((d) => {
          const g = d.data() as PartyGuest;
          return {
            ...g,
            spotifyId: g.spotifyId ?? null,
            spotifyDisplayName: g.spotifyDisplayName ?? null,
            isPremium: Boolean(g.isPremium),
            lastSeenAt: g.lastSeenAt ?? g.joinedAt ?? 0,
            isSearching: Boolean(g.isSearching),
          };
        });
        list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
        setGuests(list);
      },
      (err) => setError(err.message),
    );

    return () => {
      unsubParty();
      unsubTracks();
      unsubGuests();
    };
  }, [partyId, configured]);

  const sortedTracks = useMemo(() => sortPartyQueue(tracks), [tracks]);

  return { party, tracks: sortedTracks, guests, error };
}
