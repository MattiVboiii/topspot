"use client";

import { fill, useT } from "@/lib/i18n/LocaleProvider";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

type Props = {
  joinUrl: string;
  code: string;
  variant?: "default" | "compact" | "display";
  hint?: string;
};

export function QrCard({ joinUrl, code, variant = "default", hint }: Props) {
  const t = useT();
  const display = variant === "display";
  const compact = variant === "compact";
  const qrSize = display ? 420 : compact ? 200 : 280;
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      width: qrSize,
      margin: 2,
      color: { dark: "#0b1220", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl, qrSize]);

  const qrClass = display
    ? "h-44 w-44 sm:h-52 sm:w-52 lg:h-56 lg:w-56 xl:h-64 xl:w-64"
    : compact
      ? "h-40 w-40"
      : "h-56 w-56";

  return (
    <div
      className={`flex flex-col items-center text-center ${
        display
          ? "gap-4 rounded-[1.75rem] border border-white/12 bg-black/40 p-6 shadow-[0_0_60px_rgba(16,185,129,0.12)] backdrop-blur-xl sm:gap-5 sm:p-7"
          : compact
            ? "gap-2.5 rounded-2xl bg-white/10 p-4 backdrop-blur"
            : "gap-4 rounded-2xl bg-white/10 p-6 backdrop-blur"
      }`}
    >
      <div>
        <p
          className={`uppercase tracking-[0.22em] text-emerald-200/85 ${
            display ? "text-sm sm:text-base" : "text-xs sm:text-sm"
          }`}
        >
          {t.qr.scanToJoin}
        </p>
        {display && hint ? (
          <p className="mt-1.5 text-sm text-white/50 sm:text-base">{hint}</p>
        ) : null}
      </div>
      {dataUrl ? (
        <Image
          src={dataUrl}
          alt={fill(t.qr.altParty, { code })}
          width={qrSize}
          height={qrSize}
          unoptimized
          className={`${qrClass} rounded-2xl bg-white p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]`}
        />
      ) : (
        <div className={`${qrClass} animate-pulse rounded-2xl bg-white/20`} />
      )}
      <div>
        <p
          className={`text-white/55 ${display ? "text-sm sm:text-base" : "text-sm"}`}
        >
          {t.qr.orEnterCode}
        </p>
        <p
          className={`mt-1 font-mono font-bold tracking-[0.35em] text-white ${
            display
              ? "text-4xl sm:text-5xl lg:text-6xl"
              : compact
                ? "text-2xl sm:text-3xl"
                : "text-4xl"
          }`}
        >
          {code}
        </p>
      </div>
      {!compact && !display && (
        <a
          href={joinUrl}
          className="break-all text-xs text-emerald-200/90 underline-offset-2 hover:underline"
        >
          {joinUrl}
        </a>
      )}
    </div>
  );
}
