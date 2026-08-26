// In-memory store; correct only within a single process. Render/GCP 部署皆為單一
// 持續性 process（非 serverless、非多 instance 水平擴展），此假設目前成立。
// 若未來改成多 instance 部署，需改用共用儲存（例如 Redis）才能正確限流。
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
