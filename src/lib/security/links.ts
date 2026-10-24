/**
 * Evidence references may be plain document references ("HR-POL-12 v3") or
 * https links. Any other URL scheme (javascript:, data:, http:) is rejected.
 */
export function safeReference(ref: string): { ok: boolean; href?: string } {
  const t = ref.trim();
  if (!t || t.length > 500) return { ok: false };
  if (/^https:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      return u.protocol === "https:" ? { ok: true, href: u.toString() } : { ok: false };
    } catch {
      return { ok: false };
    }
  }
  return { ok: !/^[a-z][a-z0-9+.-]*:/i.test(t) };
}
