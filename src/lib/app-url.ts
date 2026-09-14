/**
 * Absolute origin for emails and other outbound links.
 * Falls back to localhost only when NEXT_PUBLIC_APP_URL is unset (local dev).
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

/** Build an absolute URL from an in-app path (for emails). */
export function toAbsoluteAppUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl()}${normalized}`;
}

/**
 * Convert a stored notification link (absolute or relative) into an in-app path
 * so router.push never navigates to localhost or another origin.
 */
export function toAppPath(link?: string | null): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("//")) {
    try {
      const url = new URL(`https:${trimmed}`);
      return `${url.pathname}${url.search}${url.hash}` || "/";
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith("/")) return trimmed;

  try {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return `/${trimmed.replace(/^\/+/, "")}`;
  }
}
