"use client";

import Image from "next/image";

type Props = {
  src: string | null | undefined;
  alt?: string;
  size: number;
  className?: string;
};

/** Album/playlist art from Spotify CDN (or empty placeholder). */
export function CoverArt({ src, alt = "", size, className }: Props) {
  if (!src) {
    return (
      <div
        className={className ?? "bg-white/10"}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      unoptimized={src.startsWith("data:")}
    />
  );
}
