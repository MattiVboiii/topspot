"use client";

import {
  HowItWorks,
  markHowItWorksSeen,
  useHowItWorksDismissed,
} from "@/components/party/how-it-works";
import { useT } from "@/lib/i18n/provider";
import type { GuestMode } from "@/lib/types/party";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const HOST_HOWTO_KEY = "topspot_host_howto_v1";

export default function NewPartyPage() {
  const t = useT();
  const router = useRouter();
  const [guestMode, setGuestMode] = useState<GuestMode>("anonymous");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "in" | "out">(
    "loading",
  );
  const howtoSeen = useHowItWorksDismissed(HOST_HOWTO_KEY);
  const [howtoJustDismissed, setHowtoJustDismissed] = useState(false);
  const showExplainer = !howtoSeen && !howtoJustDismissed;

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const sessionRes = await fetch("/api/auth/session");
        const session = (await sessionRes.json()) as {
          authenticated?: boolean;
        };
        if (cancelled) return;
        if (!session.authenticated) {
          setAuthState("out");
          return;
        }
        setAuthState("in");

        const partyRes = await fetch("/api/parties");
        const data = (await partyRes.json()) as {
          party?: { id: string };
        };
        if (cancelled) return;
        if (data.party?.id) {
          router.replace(`/host/${data.party.id}`);
          return;
        }
      } catch {
        if (!cancelled) setAuthState("out");
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
        resumed?: boolean;
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
        {t.host.checkingSession}
      </main>
    );
  }

  if (authState === "out") {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-white">{t.host.signInRequired}</h1>
        <p className="text-white/60">
          {t.host.hostWithPremium}
        </p>
        <a
          href="/api/auth/spotify?intent=host&returnTo=/host/new"
          className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
        >
          {t.common.signInSpotify}
        </a>
      </main>
    );
  }

  if (showExplainer) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <HowItWorks
          role="host"
          continueLabel={t.host.setupParty}
          onContinue={() => {
            markHowItWorksSeen(HOST_HOWTO_KEY);
            setHowtoJustDismissed(true);
          }}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-white">
        {t.host.newParty}
      </h1>
      <p className="mt-3 text-white/65">{t.host.guestModeBody}</p>

      <fieldset className="mt-8 flex flex-col gap-3">
        <legend className="mb-2 text-sm uppercase tracking-[0.2em] text-white/50">
          {t.settings.guestIdentity}
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
            <span className="block font-semibold text-white">
              {t.settings.anonymous}
            </span>
            <span className="text-sm text-white/55">{t.host.anonymousBody}</span>
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
            <span className="block font-semibold text-white">
              {t.settings.named}
            </span>
            <span className="text-sm text-white/55">{t.host.namedBody}</span>
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
        {busy ? t.host.creating : t.host.startParty}
      </button>
    </main>
  );
}
