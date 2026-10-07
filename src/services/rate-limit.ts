// In-memory fixed-window limiter for public pages (the change approval page, the client link).
// One process only, which suits this single-instance deployment; a hosted multi-instance
// deploy should move this to the database or Redis (docs/05).

const windows = new Map<string, { n: number; reset: number }>();

/** True when `key` has gone over `max` hits in the current window. */
export function isRateLimited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || w.reset < now) {
    windows.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  w.n++;
  return w.n > max;
}

export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}
