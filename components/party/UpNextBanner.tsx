"use client";

import { useT } from "@/lib/i18n/LocaleProvider";

type Props = {
  trackName?: string;
};

export function UpNextBanner({ trackName }: Props) {
  const t = useT();
  const title = trackName
    ? t.upNext.titleWithTrack.replace("{name}", trackName)
    : t.upNext.title;

  return (
    <div
      role="status"
      className="border-b border-emerald-400/25 bg-emerald-500/20 px-4 py-3 text-center"
    >
      <p className="text-sm font-semibold text-emerald-50 sm:text-base">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-emerald-100/75 sm:text-sm">
        {t.upNext.subtitle}
      </p>
    </div>
  );
}
