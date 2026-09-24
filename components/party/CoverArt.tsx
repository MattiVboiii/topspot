"use client";

import Image from "next/image";

type Props = {
  src: string | null | undefined;
  alt?: string;
  size: number;
  className?: string;
  priority?: boolean;
};

/** Album/playlist art from Spotify CDN (or empty placeholder). */
export function CoverArt({
  src,
  alt = "",
  size,
  className,
  priority = false,
}: Props) {
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
      priority={priority}
      unoptimized={src.startsWith("data:")}
    />
  );
}
