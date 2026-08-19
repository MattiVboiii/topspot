"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type Props = {
  joinUrl: string;
  code: string;
  variant?: "default" | "compact";
};

export function QrCard({ joinUrl, code, variant = "default" }: Props) {
  const compact = variant === "compact";
  const qrSize = compact ? 200 : 280;
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

  const qrClass = compact ? "h-40 w-40" : "h-56 w-56";

  return (
    <div
      className={`flex flex-col items-center rounded-2xl bg-white/10 text-center backdrop-blur ${compact ? "gap-2.5 p-4" : "gap-4 p-6"}`}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80 sm:text-sm">
        Scan to join
      </p>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`QR code for party ${code}`}
          className={`${qrClass} rounded-xl bg-white p-2`}
        />
      ) : (
        <div className={`${qrClass} animate-pulse rounded-xl bg-white/20`} />
      )}
      <div>
        <p className="text-sm text-white/70">Or enter code</p>
        <p
          className={`mt-1 font-mono font-bold tracking-[0.35em] text-white ${compact ? "text-2xl sm:text-3xl" : "text-4xl"}`}
        >
          {code}
        </p>
      </div>
      {!compact && (
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
