"use client";

import { LocaleToggle } from "@/components/LocaleToggle";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useSyncExternalStore } from "react";

type Role = "host" | "guest";

type Props = {
  role: Role;
  onContinue: () => void;
  continueLabel?: string;
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
  continueLabel,
}: Props) {
  const t = useT();
  const title =
    role === "host" ? t.howItWorks.hostTitle : t.howItWorks.guestTitle;
  const points =
    role === "host" ? t.howItWorks.hostPoints : t.howItWorks.guestPoints;

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
          {t.brand}
        </p>
        <LocaleToggle />
      </div>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold text-white">
        {title}
      </h1>
      <ul className="mt-6 space-y-3">
        {points.map((point) => (
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
        {continueLabel ?? t.common.continue}
      </button>
    </div>
  );
}
