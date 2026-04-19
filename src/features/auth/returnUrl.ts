/** Безопасный return URL только для внутренних путей (без open redirect). */
export function sanitizeInternalReturnUrl(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") {
    return null;
  }
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) {
    return null;
  }
  if (t.includes("://")) {
    return null;
  }
  return t;
}
