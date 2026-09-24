"use client";

import { fill, useT } from "@/lib/i18n/provider";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

type Props = {
  joinUrl: string;
  code: string;
  variant?: "default" | "compact" | "display";
};

export function QrCard({ joinUrl, code, variant = "default" }: Props) {
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
    ? "h-56 w-56 sm:h-72 sm:w-72 lg:h-80 lg:w-80"
    : compact
      ? "h-40 w-40"
      : "h-56 w-56";

  return (
    <div
      className={`flex flex-col items-center text-center backdrop-blur ${
        display
          ? "gap-5 rounded-3xl bg-white/10 p-8"
          : compact
            ? "gap-2.5 rounded-2xl bg-white/10 p-4"
            : "gap-4 rounded-2xl bg-white/10 p-6"
      }`}
    >
      <p
        className={`uppercase tracking-[0.2em] text-emerald-200/80 ${
          display ? "text-sm sm:text-base" : "text-xs sm:text-sm"
        }`}
      >
        {t.qr.scanToJoin}
      </p>
      {dataUrl ? (
        <Image
          src={dataUrl}
          alt={fill(t.qr.altParty, { code })}
          width={qrSize}
          height={qrSize}
          unoptimized
          className={`${qrClass} rounded-xl bg-white p-2`}
        />
      ) : (
        <div className={`${qrClass} animate-pulse rounded-xl bg-white/20`} />
      )}
      <div>
        <p className={`text-white/70 ${display ? "text-base" : "text-sm"}`}>
          {t.qr.orEnterCode}
        </p>
        <p
          className={`mt-1 font-mono font-bold tracking-[0.35em] text-white ${
            display
              ? "text-5xl sm:text-6xl lg:text-7xl"
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
