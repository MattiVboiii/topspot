"use client";

import { useT } from "@/lib/i18n/LocaleProvider";
import { useState } from "react";

type Props = {
  onSubmit: (displayName: string) => Promise<void>;
};

export function GuestNameGate({ onSubmit }: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(name.trim());
        } catch (err) {
          setError(err instanceof Error ? err.message : t.guestGate.join);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-semibold text-white">{t.guestGate.title}</h2>
      <p className="text-sm text-white/65">{t.guestGate.body}</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        required
        placeholder={t.guestGate.nameLabel}
        className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white outline-none ring-emerald-400/50 focus:ring-2"
      />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={busy || name.trim().length < 1}
        className="rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-emerald-950 disabled:opacity-50"
      >
        {busy ? t.guestGate.joining : t.guestGate.join}
      </button>
    </form>
  );
}
