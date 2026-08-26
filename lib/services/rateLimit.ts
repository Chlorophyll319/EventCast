const requestTimestamps = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const windowStart = now - windowMs;
  const timestamps = (requestTimestamps.get(key) ?? []).filter((ts) => ts > windowStart);

  if (timestamps.length >= limit) {
    requestTimestamps.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  requestTimestamps.set(key, timestamps);
  return true;
}

export function _resetRateLimitStoreForTests(): void {
  requestTimestamps.clear();
}
