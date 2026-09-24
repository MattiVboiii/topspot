"use client";

import type { Party } from "@/lib/types/party";
import { useCallback, useEffect, useState } from "react";

type GetIdToken = () => Promise<string>;

type GuestOptions = {
  mode: "guest";
  enabled: boolean;
  getIdToken: GetIdToken;
  onJoined?: (party: Party, guestId: string | null) => void | Promise<void>;
};

type DisplayOptions = {
  mode: "display";
};

type Options = GuestOptions | DisplayOptions;

export function usePartyByCode(code: string, options: Options) {
  const [partyMeta, setPartyMeta] = useState<Party | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [gateNeeded, setGateNeeded] = useState(false);
  const [guestId, setGuestId] = useState<string | null>(null);

  const isGuest = options.mode === "guest";
  const enabled = isGuest ? options.enabled : true;
  const getIdToken = isGuest ? options.getIdToken : null;
  const onJoined = isGuest ? options.onJoined : undefined;

  const joinParty = useCallback(
    async (displayName?: string) => {
      if (!getIdToken) {
        throw new Error("joinParty requires guest mode");
      }
      const token = await getIdToken();
      const res = await fetch(`/api/parties/by-code/${code}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName }),
      });
      const data = (await res.json()) as {
        party?: Party;
        guestId?: string;
        error?: string;
      };
      if (!res.ok || !data.party) {
        throw new Error(data.error || "Could not join party");
      }
      setPartyMeta(data.party);
      setJoined(true);
      setGateNeeded(false);
      const nextGuestId = data.guestId ?? null;
      if (nextGuestId) setGuestId(nextGuestId);
      await onJoined?.(data.party, nextGuestId);
      return { party: data.party, guestId: nextGuestId, token };
    },
    [code, getIdToken, onJoined],
  );

  useEffect(() => {
    if (!enabled || !code) return;
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch(`/api/parties/by-code/${code}`);
        const data = (await res.json()) as { party?: Party; error?: string };
        if (!res.ok || !data.party) {
          throw new Error(data.error || "Party not found");
        }
        if (cancelled) return;
        setPartyMeta(data.party);

        if (options.mode === "display") return;

        if (!data.party.isActive) return;
        if (data.party.guestMode === "named") {
          setGateNeeded(true);
        } else {
          await joinParty();
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [enabled, code, joinParty, options.mode]);

  return {
    partyMeta,
    setPartyMeta,
    loadError,
    joined,
    gateNeeded,
    guestId,
    setGuestId,
    joinParty,
  };
}
