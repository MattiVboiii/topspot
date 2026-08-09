"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [hostName, setHostName] = useState<string | null>(null);
  const error = searchParams.get("error");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; displayName?: string }) => {
        if (!cancelled && data.authenticated) {
          setHostName(data.displayName ?? "Host");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function onJoin(e: FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    router.push(`/p/${normalized}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
        Topspot
      </p>
      <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-5xl font-extrabold leading-tight text-white sm:text-6xl">
        Let the room pick the music.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-white/70">
        Host a Spotify party, share a code or QR, and let guests add tracks and
        vote the queue up in real time.
      </p>

      {error && (
        <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Host a party</h2>
          <p className="mt-2 text-sm text-white/60">
            Spotify Premium required. Playback runs in your browser.
          </p>
          {hostName ? (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-sm text-emerald-200">
                Signed in as {hostName}
              </p>
              <Link
                href="/host/new"
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
              >
                Create party
              </Link>
              <button
                type="button"
                className="text-sm text-white/50 underline-offset-2 hover:underline"
                onClick={async () => {
                  await fetch("/api/auth/session", { method: "DELETE" });
                  setHostName(null);
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/spotify"
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
            >
              Sign in with Spotify
            </a>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Join a party</h2>
          <p className="mt-2 text-sm text-white/60">
            Enter the code from the host screen or scan their QR.
          </p>
          <form
            onSubmit={onJoin}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PARTY CODE"
              maxLength={8}
              className="flex-1 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 font-mono tracking-[0.2em] text-white outline-none ring-emerald-400/40 focus:ring-2"
            />
            <button
              type="submit"
              className="rounded-2xl border border-white/20 px-5 py-3 font-semibold text-white hover:bg-white/10"
            >
              Join
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center p-8 text-white/60">
          Loading…
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
