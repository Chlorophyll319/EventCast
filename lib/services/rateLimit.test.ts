import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetRateLimitStoreForTests, checkRateLimit } from "./rateLimit";

beforeEach(() => {
  vi.useFakeTimers();
  _resetRateLimitStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("token-1", 3, 60_000)).toBe(true);
    }
  });

  it("rejects requests once the limit is reached", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("token-1", 3, 60_000);
    }
    expect(checkRateLimit("token-1", 3, 60_000)).toBe(false);
  });

  it("tracks each key independently", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("token-1", 3, 60_000);
    }
    expect(checkRateLimit("token-2", 3, 60_000)).toBe(true);
  });

  it("allows requests again once old timestamps slide out of the window", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("token-1", 3, 60_000);
    }
    expect(checkRateLimit("token-1", 3, 60_000)).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(checkRateLimit("token-1", 3, 60_000)).toBe(true);
  });

  it("does not allow a 2x burst at a fixed-window boundary (sliding window)", () => {
    const windowStart = Date.now();
    for (let i = 0; i < 3; i++) {
      checkRateLimit("token-1", 3, 60_000, windowStart + 59_000);
    }

    expect(checkRateLimit("token-1", 3, 60_000, windowStart + 60_500)).toBe(false);
  });
});
