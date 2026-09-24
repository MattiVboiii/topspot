"use client";

import { useT } from "@/lib/i18n/provider";
import type { Party } from "@/lib/types/party";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  party: Party;
  guestId: string | null;
  getIdToken: () => Promise<string>;
};

export function HostTransferBanner({ party, guestId }: Props) {
  const t = useT();
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
      if (!res.ok) throw new Error(data.error || t.transfer.take);
      router.push(`/host/${party.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.transfer.take);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
      <p className="font-semibold text-amber-100">{t.transfer.title}</p>
      <p className="mt-1 text-sm text-amber-100/80">{t.transfer.body}</p>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        className="mt-3 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
      >
        {busy ? t.transfer.taking : t.transfer.take}
      </button>
    </section>
  );
}
