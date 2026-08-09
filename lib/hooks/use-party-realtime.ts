"use client";

import { getClientDb, isFirebaseConfigured } from "@/lib/firebase/client";
import type { Party, PartyTrack } from "@/lib/types/party";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

export function usePartyRealtime(partyId: string | null) {
  const configured = isFirebaseConfigured();
  const [party, setParty] = useState<Party | null>(null);
  const [tracks, setTracks] = useState<PartyTrack[]>([]);
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
        setParty(snap.data() as Party);
      },
      (err) => setError(err.message),
    );

    const tracksQuery = query(
      collection(db, "parties", partyId, "tracks"),
      orderBy("voteCount", "desc"),
      orderBy("addedAt", "asc"),
    );
    const unsubTracks = onSnapshot(
      tracksQuery,
      (snap) => {
        setTracks(snap.docs.map((d) => d.data() as PartyTrack));
      },
      (err) => setError(err.message),
    );

    return () => {
      unsubParty();
      unsubTracks();
    };
  }, [partyId, configured]);

  const sortedTracks = useMemo(() => {
    const playingId = party?.nowPlayingTrackId;
    if (!playingId) return tracks;
    const playing = tracks.find((t) => t.id === playingId);
    const rest = tracks.filter((t) => t.id !== playingId);
    return playing ? [playing, ...rest] : tracks;
  }, [tracks, party]);

  return { party, tracks: sortedTracks, error };
}
