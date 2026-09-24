"use client";

import { useT } from "@/lib/i18n/LocaleProvider";

type Props = {
  onEndParty: () => void;
};

export function HostDangerZone({ onEndParty }: Props) {
  const t = useT();

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
        {t.settings.partySection}
      </h3>
      <button
        type="button"
        onClick={onEndParty}
        className="w-full rounded-xl border border-red-400/40 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/10"
      >
        {t.settings.endParty}
      </button>
    </section>
  );
}
