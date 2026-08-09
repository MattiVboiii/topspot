"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type Props = {
  joinUrl: string;
  code: string;
};

export function QrCard({ joinUrl, code }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#0b1220", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/10 p-6 text-center backdrop-blur">
      <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">
        Scan to join
      </p>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`QR code for party ${code}`}
          className="h-56 w-56 rounded-xl bg-white p-2"
        />
      ) : (
        <div className="h-56 w-56 animate-pulse rounded-xl bg-white/20" />
      )}
      <div>
        <p className="text-sm text-white/70">Or enter code</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.35em] text-white">
          {code}
        </p>
      </div>
      <a
        href={joinUrl}
        className="break-all text-xs text-emerald-200/90 underline-offset-2 hover:underline"
      >
        {joinUrl}
      </a>
    </div>
  );
}
