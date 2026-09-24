"use client";

import { CoverArt } from "@/components/party/CoverArt";
import {
  DISPLAY_UPVOTE_TOAST_MAX,
  type DisplayUpvoteToast,
} from "@/lib/hooks/use-display-upvote-feed";
import { fill, useT } from "@/lib/i18n/LocaleProvider";
import { useEffect, useState } from "react";

/** Visible hold before fade-down. */
const TOAST_HOLD_MS = 2800;
/** Must match `.display-upvote-toast-out` duration. */
const TOAST_EXIT_MS = 420;

type Props = {
  toasts: DisplayUpvoteToast[];
  onDismiss: (toastId: string) => void;
};

function UpvoteToastItem({
  toast,
  forceExit,
  onDismiss,
}: {
  toast: DisplayUpvoteToast;
  forceExit: boolean;
  onDismiss: (toastId: string) => void;
}) {
  const t = useT();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (forceExit) {
      setExiting(true);
      return;
    }
    const holdTimer = window.setTimeout(() => setExiting(true), TOAST_HOLD_MS);
    return () => window.clearTimeout(holdTimer);
  }, [forceExit]);

  useEffect(() => {
    if (!exiting) return;
    const removeTimer = window.setTimeout(
      () => onDismiss(toast.id),
      TOAST_EXIT_MS,
    );
    return () => window.clearTimeout(removeTimer);
  }, [exiting, onDismiss, toast.id]);

  return (
    <div
      className={`flex max-w-lg items-center gap-3 rounded-2xl border border-emerald-300/25 bg-[#071018]/88 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-md ${
        exiting ? "display-upvote-toast-out" : "display-upvote-toast-in"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-lg font-bold text-emerald-950 ${
          exiting ? "" : "display-upvote-toast-arrow"
        }`}
      >
        ▲
      </span>
      <CoverArt
        src={toast.albumArtUrl}
        size={48}
        className="h-12 w-12 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/80">
          {t.display.upvoteToastLabel}
        </p>
        <p className="truncate text-base font-semibold text-white">
          {fill(t.display.upvoteToast, { song: toast.trackName })}
        </p>
        <p className="truncate text-sm text-white/50">{toast.artists}</p>
      </div>
    </div>
  );
}

export function DisplayUpvoteToasts({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  const overflowCount = Math.max(0, toasts.length - DISPLAY_UPVOTE_TOAST_MAX);
  const overflowIds = new Set(
    toasts.slice(0, overflowCount).map((toast) => toast.id),
  );

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-3 px-4 sm:bottom-8"
    >
      {toasts.map((toast) => (
        <UpvoteToastItem
          key={toast.id}
          toast={toast}
          forceExit={overflowIds.has(toast.id)}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
