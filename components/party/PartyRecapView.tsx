"use client";

import { LocaleToggle } from "@/components/LocaleToggle";
import { CoverArt } from "@/components/party/CoverArt";
import { fill, useT } from "@/lib/i18n/LocaleProvider";
import type { PartyRecap } from "@/lib/party/recap";
import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  partyId: string;
  code: string;
  hostDisplayName: string;
  canExport?: boolean;
  homeHref?: string;
};

type RecapPayload = {
  party?: {
    id: string;
    code: string;
    hostDisplayName: string;
    isActive: boolean;
  };
  recap?: PartyRecap;
  guestCount?: number;
  error?: string;
};

export function PartyRecapView({
  partyId,
  code,
  hostDisplayName,
  canExport = false,
  homeHref = "/",
}: Props) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<PartyRecap | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/parties/${partyId}/recap`);
        const data = (await res.json()) as RecapPayload;
        if (!res.ok || !data.recap) {
          throw new Error(data.error || "Could not load recap");
        }
        if (!cancelled) {
          setRecap(data.recap);
          setGuestCount(data.guestCount ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load recap");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  async function exportPlaylist() {
    setExporting(true);
    setExportMessage(null);
    setPlaylistUrl(null);
    try {
      const res = await fetch(`/api/parties/${partyId}/export-playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `TopSpot · ${code}` }),
      });
      const data = (await res.json()) as {
        error?: string;
        playlist?: { externalUrl?: string | null };
        trackCount?: number;
      };
      if (!res.ok) {
        throw new Error(data.error || "Export failed");
      }
      setExportMessage(
        fill(t.recap.exported, { count: data.trackCount ?? 0 }),
      );
      if (data.playlist?.externalUrl) {
        setPlaylistUrl(data.playlist.externalUrl);
      }
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 text-white/60">
        {t.common.loading}
      </main>
    );
  }

  if (error || !recap) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-12 text-center">
        <p className="text-red-300">{error || t.recap.notAvailable}</p>
        <Link href={homeHref} className="text-emerald-300 underline">
          {t.common.backHome}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 pb-16">
      <header>
        <div className="flex items-center justify-between gap-3">
          <Link href={homeHref} className="text-sm text-emerald-300/80">
            ← {t.brand}
          </Link>
          <LocaleToggle />
        </div>
        <p className="mt-4 text-sm uppercase tracking-[0.25em] text-white/45">
          {t.recap.label}
        </p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl font-bold text-white">
          {code}
        </h1>
        <p className="text-white/55">{fill(t.recap.hostedBy, { name: hostDisplayName })}</p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat
          label={t.recap.played}
          value={String(recap.totals.tracksPlayed)}
        />
        <Stat label={t.recap.guests} value={String(guestCount)} />
        <Stat
          label={t.recap.upvotes}
          value={String(recap.totals.totalUpVotes)}
        />
      </section>

      {canExport && (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <h2 className="font-semibold text-white">{t.recap.saveNight}</h2>
          <p className="mt-1 text-sm text-white/60">{t.recap.saveNightBody}</p>
          <button
            type="button"
            disabled={exporting || recap.totals.tracksPlayed === 0}
            onClick={() => void exportPlaylist()}
            className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 disabled:opacity-50"
          >
            {exporting ? t.recap.exporting : t.recap.exportCta}
          </button>
          {exportMessage && (
            <p className="mt-2 text-sm text-emerald-100/90">{exportMessage}</p>
          )}
          {playlistUrl && (
            <a
              href={playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-emerald-300 underline"
            >
              {t.recap.openPlaylist}
            </a>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">
          {t.recap.topVoted}
        </h2>
        {recap.topTracks.length === 0 ? (
          <p className="text-sm text-white/50">{t.recap.noTracks}</p>
        ) : (
          <ol className="space-y-3">
            {recap.topTracks.slice(0, 15).map((track, index) => (
              <li key={track.trackId} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-sm font-semibold text-white/40">
                  {index + 1}
                </span>
                {track.albumArtUrl ? (
                  <CoverArt
                    src={track.albumArtUrl}
                    size={40}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {track.name}
                  </p>
                  <p className="truncate text-xs text-white/50">
                    {track.artists}
                    {track.addedByName
                      ? ` · ${t.recap.addedBy} ${track.addedByName}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-emerald-300">
                  ↑ {track.peakUpVoteCount}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-lg font-semibold text-white">
          {t.recap.whoAdded}
        </h2>
        {recap.contributors.length === 0 ? (
          <p className="text-sm text-white/50">{t.recap.noRequests}</p>
        ) : (
          <ul className="space-y-4">
            {recap.contributors.map((c) => (
              <li key={c.guestId}>
                <p className="text-sm font-semibold text-white">
                  {c.displayName || t.recap.anonymousGuest}{" "}
                  <span className="font-normal text-white/45">
                    · {c.trackCount}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5 pl-1">
                  {c.tracks.slice(0, 8).map((tr) => (
                    <li
                      key={`${c.guestId}-${tr.trackId}`}
                      className="truncate text-xs text-white/55"
                    >
                      {tr.name} · {tr.artists}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-white/45">
        {label}
      </p>
    </div>
  );
}
