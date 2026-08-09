"use client";

import type { GuestMode } from "@/lib/types/party";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function NewPartyPage() {
  const router = useRouter();
  const [guestMode, setGuestMode] = useState<GuestMode>("anonymous");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "in" | "out">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { authenticated?: boolean }) => {
        if (cancelled) return;
        setAuthState(data.authenticated ? "in" : "out");
      })
      .catch(() => {
        if (!cancelled) setAuthState("out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createParty() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestMode }),
      });
      const data = (await res.json()) as {
        party?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.party) {
        throw new Error(data.error || "Could not create party");
      }
      router.push(`/host/${data.party.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create party");
      setBusy(false);
    }
  }

  if (authState === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-white/60">
        Checking Spotify session…
      </main>
    );
  }

  if (authState === "out") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-white">Sign in required</h1>
        <p className="text-white/60">
          Host a party with your Spotify Premium account.
        </p>
        <a
          href="/api/auth/spotify"
          className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
        >
          Sign in with Spotify
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-white">
        New party
      </h1>
      <p className="mt-3 text-white/65">
        Choose how guests identify themselves. You can change this later from
        the host dashboard.
      </p>

      <fieldset className="mt-8 flex flex-col gap-3">
        <legend className="mb-2 text-sm uppercase tracking-[0.2em] text-white/50">
          Guest identity
        </legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <input
            type="radio"
            name="guestMode"
            checked={guestMode === "anonymous"}
            onChange={() => setGuestMode("anonymous")}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold text-white">Anonymous</span>
            <span className="text-sm text-white/55">
              Guests join with the code only — fastest for big rooms.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <input
            type="radio"
            name="guestMode"
            checked={guestMode === "named"}
            onChange={() => setGuestMode("named")}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold text-white">By name</span>
            <span className="text-sm text-white/55">
              Guests pick a display name before they can add or vote.
            </span>
          </span>
        </label>
      </fieldset>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void createParty()}
        className="mt-8 rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Start party"}
      </button>
    </main>
  );
}
