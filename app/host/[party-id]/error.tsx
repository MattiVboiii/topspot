"use client";

import Link from "next/link";

export default function HostPartyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
      <p className="text-red-300">{error.message || "Something went wrong"}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
      >
        Try again
      </button>
      <Link href="/" className="text-emerald-300 underline">
        Back home
      </Link>
    </main>
  );
}
