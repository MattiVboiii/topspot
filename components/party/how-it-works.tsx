"use client";

import { useSyncExternalStore } from "react";

type Role = "host" | "guest";

type Props = {
  role: Role;
  onContinue: () => void;
  continueLabel?: string;
};

const COPY: Record<Role, { title: string; points: string[] }> = {
  host: {
    title: "How hosting works",
    points: [
      "You need Spotify Premium. Playback runs in this browser tab — keep it open.",
      "Share the party code or QR so guests can join from their phones.",
      "Guests add requests and vote. Requests always play before fallback tracks.",
      "In Settings you can add a fallback playlist, toggle downvotes, see who’s here, or hand music control to a Premium guest (you stay the owner).",
    ],
  },
  guest: {
    title: "How joining works",
    points: [
      "Search for songs (or connect Spotify to add from your Liked songs) and add them to the queue.",
      "Vote to bump tracks up. If the host enabled downvotes, you can downvote too.",
      "Requests always play before the host’s fallback playlist — your picks jump the line after the current song.",
      "The host controls Play / Pause / Skip on their device. You don’t need Spotify Premium to join.",
    ],
  },
};

export function howItWorksSeen(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function markHowItWorksSeen(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // ignore
  }
}

function subscribeHowItWorks() {
  return () => undefined;
}

export function useHowItWorksDismissed(storageKey: string): boolean {
  return useSyncExternalStore(
    subscribeHowItWorks,
    () => howItWorksSeen(storageKey),
    () => false,
  );
}

export function HowItWorks({
  role,
  onContinue,
  continueLabel = "Continue",
}: Props) {
  const copy = COPY[role];

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
        Topspot
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
        {copy.title}
      </h1>
      <ul className="mt-6 space-y-3">
        {copy.points.map((point) => (
          <li
            key={point}
            className="rounded-2xl bg-black/20 px-4 py-3 text-sm leading-relaxed text-white/75"
          >
            {point}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onContinue}
        className="mt-8 w-full rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
      >
        {continueLabel}
      </button>
    </div>
  );
}
