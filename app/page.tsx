"use client";

import { LocaleToggle } from "@/components/LocaleToggle";
import { fill, useT } from "@/lib/i18n/LocaleProvider";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";

function HomeContent() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [hostName, setHostName] = useState<string | null>(null);
  const [activePartyId, setActivePartyId] = useState<string | null>(null);
  const error = searchParams.get("error");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/parties")
      .then((res) => res.json())
      .then(
        (data: {
          authenticated?: boolean;
          displayName?: string;
          party?: { id: string; hostDisplayName?: string } | null;
        }) => {
          if (cancelled) return;
          if (data.authenticated || data.party) {
            setHostName(
              data.party?.hostDisplayName ||
                data.displayName ||
                t.host.roleHost,
            );
          }
          if (data.party?.id) setActivePartyId(data.party.id);
        },
      )
      .catch(() => undefined);
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; displayName?: string }) => {
        if (!cancelled && data.authenticated) {
          setHostName((prev) => prev || data.displayName || t.host.roleHost);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [t.host.roleHost]);

  function onJoin(e: FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    router.push(`/p/${normalized}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-12 sm:max-w-5xl sm:px-6 sm:py-16">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
          {t.brand}
        </p>
        <LocaleToggle />
      </div>
      <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl font-extrabold leading-tight text-white sm:text-6xl">
        {t.home.headline}
      </h1>
      <p className="mt-5 max-w-xl text-base text-white/70 sm:text-lg">
        {t.home.sub}
      </p>

      {error && (
        <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col gap-5 md:mt-12 md:grid md:grid-cols-2 md:gap-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
          <h2 className="text-xl font-semibold text-white">
            {t.home.hostTitle}
          </h2>
          <p className="mt-2 text-sm text-white/60">{t.home.hostBody}</p>
          {hostName ? (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-sm text-emerald-200">
                {fill(t.common.signedInAs, { name: hostName })}
              </p>
              {activePartyId ? (
                <Link
                  href={`/host/${activePartyId}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
                >
                  {t.home.continueParty}
                </Link>
              ) : (
                <Link
                  href="/host/new"
                  className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
                >
                  {t.home.createParty}
                </Link>
              )}
              <button
                type="button"
                className="text-sm text-white/50 underline-offset-2 hover:underline"
                onClick={async () => {
                  await fetch("/api/auth/session", { method: "DELETE" });
                  setHostName(null);
                  setActivePartyId(null);
                }}
              >
                {t.common.signOut}
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/spotify?intent=host&returnTo=/host/new"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
            >
              {t.home.hostCta}
            </a>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
          <h2 className="text-xl font-semibold text-white">
            {t.home.joinTitle}
          </h2>
          <p className="mt-2 text-sm text-white/60">{t.home.joinBody}</p>
          <form
            onSubmit={onJoin}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t.home.joinPlaceholder}
              maxLength={8}
              className="min-h-12 flex-1 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 font-mono tracking-[0.2em] text-white outline-none ring-emerald-400/40 focus:ring-2"
            />
            <button
              type="submit"
              className="min-h-12 rounded-2xl border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10"
            >
              {t.home.joinCta}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function HomeLoading() {
  const t = useT();
  return (
    <main className="flex flex-1 items-center justify-center p-8 text-white/60">
      {t.common.loading}
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
