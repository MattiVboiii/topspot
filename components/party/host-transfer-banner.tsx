"use client";

import type { Party } from "@/lib/types/party";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  party: Party;
  guestId: string | null;
  getIdToken: () => Promise<string>;
};

export function HostTransferBanner({ party, guestId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    !party.pendingPlaybackGuestId ||
    !guestId ||
    party.pendingPlaybackGuestId !== guestId
  ) {
    return null;
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/parties/${party.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not accept");
      // Music control only — stay linked to the party as controller on host UI
      router.push(`/host/${party.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
      <p className="font-semibold text-amber-100">
        You&apos;re invited to control the music
      </p>
      <p className="mt-1 text-sm text-amber-100/80">
        The party owner stays in charge of settings. Accepting only moves Play /
        Pause / Skip to your Spotify Premium account — keep this tab open.
      </p>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        className="mt-3 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
      >
        {busy ? "Taking control…" : "Take music control"}
      </button>
    </section>
  );
}
