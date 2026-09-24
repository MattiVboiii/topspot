"use client";

import { en } from "@/lib/i18n/en";
import { nl } from "@/lib/i18n/nl";
import {
  LOCALE_STORAGE_KEY,
  type Dictionary,
  type Locale,
} from "@/lib/i18n/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const dictionaries: Record<Locale, Dictionary> = { en, nl };

type LocaleContextValue = {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

let localeMemory: Locale | null = null;
const listeners = new Set<() => void>();

function emitLocaleChange() {
  listeners.forEach((l) => l());
}

function subscribeLocale(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function readStoredLocale(): Locale {
  if (localeMemory) return localeMemory;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "nl") {
      localeMemory = stored;
      return stored;
    }
  } catch {
    // ignore
  }
  const lang = window.navigator.language?.toLowerCase() ?? "en";
  localeMemory = lang.startsWith("nl") ? "nl" : "en";
  return localeMemory;
}

function getServerLocale(): Locale {
  return "en";
}

function persistLocale(next: Locale) {
  localeMemory = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // ignore
  }
  emitLocaleChange();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const storedLocale = useSyncExternalStore(
    subscribeLocale,
    readStoredLocale,
    getServerLocale,
  );
  const [override, setOverride] = useState<Locale | null>(null);
  const locale = override ?? storedLocale;

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setOverride(next);
    persistLocale(next);
  }, []);

  const toggleLocale = useCallback(() => {
    const next: Locale = locale === "en" ? "nl" : "en";
    setOverride(next);
    persistLocale(next);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      t: dictionaries[locale],
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useT() {
  return useLocale().t;
}

/** Replace `{key}` placeholders in a dictionary string. */
export function fill(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
