/** Canonical public origin for redirects, OAuth, and absolute links. */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }

  return "http://127.0.0.1:3000";
}

/**
 * Only relative same-origin paths are allowed (blocks open redirects).
 * Rejects protocol-relative URLs like //evil.com.
 */
export function safeReturnPath(
  returnTo: string | null | undefined,
  fallback = "/",
): string {
  if (!returnTo) return fallback;
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return fallback;
  if (returnTo.includes("://")) return fallback;
  return returnTo;
}
