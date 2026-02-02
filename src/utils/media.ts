const NODE_HOST = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

/**
 * Converts:
 *  - "/media/rapports/x.jpg"
 *  - "media/rapports/x.jpg"
 *  - "http://..."
 * into a full absolute URL served by Node.
 */
export function mediaUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;

  const s = String(pathOrUrl).trim();
  if (!s) return null;

  // Already absolute
  if (/^https?:\/\//i.test(s)) return s;

  // Ensure leading slash
  const rel = s.startsWith("/") ? s : `/${s}`;
  return NODE_HOST ? `${NODE_HOST}${rel}` : rel;
}
