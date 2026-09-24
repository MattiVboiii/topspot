"use client";

import { PartyRecapView } from "@/components/party/PartyRecapView";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function HostRecapPage() {
  const t = useT();
  const params = useParams<{ "party-id": string }>();
  const partyId = params["party-id"];
  const [meta, setMeta] = useState<{
    code: string;
    hostDisplayName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sessionRes = await fetch("/api/auth/session");
        const session = (await sessionRes.json()) as {
          authenticated?: boolean;
          spotifyId?: string;
        };
        if (!session.authenticated) {
          if (!cancelled) setAuthorized(false);
          return;
        }

        const res = await fetch(`/api/parties/${partyId}`);
        const data = (await res.json()) as {
          party?: {
            code: string;
            hostDisplayName: string;
            hostSpotifyId: string;
          };
          error?: string;
        };
        if (!res.ok || !data.party) {
          throw new Error(data.error || "Party not found");
        }
        if (!cancelled) {
          setAuthorized(data.party.hostSpotifyId === session.spotifyId);
          setMeta({
            code: data.party.code,
            hostDisplayName: data.party.hostDisplayName,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-red-300">
        {error}
      </main>
    );
  }

  if (authorized === false) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16 text-center">
        <p className="text-white/70">{t.recap.signInForRecap}</p>
        <a
          href={`/api/auth/spotify?intent=host&returnTo=${encodeURIComponent(`/host/${partyId}/recap`)}`}
          className="rounded-2xl bg-emerald-400 px-5 py-3 font-semibold text-emerald-950"
        >
          {t.common.signInSpotify}
        </a>
      </main>
    );
  }

  if (!meta || authorized === null) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-white/60">
        {t.common.loading}
      </main>
    );
  }

  return (
    <PartyRecapView
      partyId={partyId}
      code={meta.code}
      hostDisplayName={meta.hostDisplayName}
      canExport
      homeHref="/"
    />
  );
}
