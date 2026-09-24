"use client";

import { fill, useT } from "@/lib/i18n/LocaleProvider";
import { isGuestOnline } from "@/lib/party/queue";
import type { Party, PartyGuest } from "@/lib/types/party";

type Props = {
  party: Party;
  guests: PartyGuest[];
  eligibleGuests: PartyGuest[];
  controlDelegated: boolean;
  controllerGuest: PartyGuest | undefined;
  onlineCount: number;
  transferringId: string | null;
  onTransferTo: (guest: PartyGuest) => void;
  onReclaimControl: () => void;
};

export function HostTransferSection({
  party,
  guests,
  eligibleGuests,
  controlDelegated,
  controllerGuest,
  onlineCount,
  transferringId,
  onTransferTo,
  onReclaimControl,
}: Props) {
  const t = useT();

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        {t.settings.peopleTitle} (
        {fill(t.settings.peopleCounts, {
          online: onlineCount,
          joined: guests.length,
        })}
        )
      </h3>
      {controlDelegated && (
        <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-100">
            {fill(t.settings.musicControlWith, {
              name:
                controllerGuest?.spotifyDisplayName ||
                controllerGuest?.displayName ||
                t.common.guest,
            })}
          </p>
          <button
            type="button"
            onClick={onReclaimControl}
            className="mt-2 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-950"
          >
            {t.settings.takeMusicBack}
          </button>
        </div>
      )}
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {guests.map((g) => {
          const online = isGuestOnline(g);
          const status = !online
            ? t.common.away
            : g.isSearching
              ? t.settings.lookingForSongs
              : t.common.online;
          return (
            <li
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {g.displayName ||
                    g.spotifyDisplayName ||
                    t.settings.anonymousGuest}
                  {g.spotifyId === party.hostSpotifyId
                    ? ` (${t.common.owner})`
                    : ""}
                  {g.id === party.playbackGuestId
                    ? ` · ${t.settings.musicSuffix}`
                    : ""}
                </p>
                <p className="text-xs text-white/45">
                  <span
                    className={
                      online
                        ? g.isSearching
                          ? "text-sky-300"
                          : "text-emerald-300"
                        : "text-white/40"
                    }
                  >
                    {status}
                  </span>
                  {" · "}
                  {g.spotifyId
                    ? g.isPremium
                      ? t.settings.spotifyPremiumLinked
                      : t.settings.spotifyLinked
                    : t.common.guest}
                </p>
              </div>
              {eligibleGuests.some((e) => e.id === g.id) && (
                <button
                  type="button"
                  disabled={transferringId === g.id}
                  onClick={() => onTransferTo(g)}
                  className="shrink-0 rounded-lg bg-amber-400/90 px-2.5 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
                >
                  {t.settings.giveMusic}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
