"use client";

import { useLocale } from "@/lib/i18n/provider";

type Props = {
  className?: string;
};

export function LocaleToggle({ className }: Props) {
  const { locale, t, toggleLocale } = useLocale();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={
        className ??
        "rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
      }
      aria-label={locale === "en" ? "Switch to Dutch" : "Schakel naar Engels"}
    >
      {t.langToggle}
    </button>
  );
}
