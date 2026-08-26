import { describe, expect, it } from "vitest";
import { buildMetaDescription, formatDateRange, formatEventTime, resolveRobots, shouldIncrementViewCount } from "./format";

describe("formatDateRange", () => {
  it("formats a date range in UTC", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-07T00:00:00.000Z");

    expect(formatDateRange(start, end, "UTC")).toBe("2026/09/01 – 2026/09/07");
  });

  it("shifts the displayed date across a day boundary for a non-UTC timezone", () => {
    // 23:30 UTC = 07:30 next day in Asia/Taipei (+8)，日期應換算為當地日期而非 UTC 日期。
    const start = new Date("2026-08-31T23:30:00.000Z");
    const end = new Date("2026-08-31T23:30:00.000Z");

    expect(formatDateRange(start, end, "Asia/Taipei")).toBe("2026/09/01 – 2026/09/01");
  });
});

describe("formatEventTime", () => {
  it("displays only start time when endTime is absent", () => {
    const start = new Date("2026-09-01T08:00:00.000Z");

    const result = formatEventTime(start, null, "UTC");

    expect(result.display).toBe("09/01 08:00");
    expect(result.startIso).toBe(start.toISOString());
    expect(result.endIso).toBeNull();
  });

  it("displays a start–end range when endTime is present, on the same day", () => {
    const start = new Date("2026-09-01T08:00:00.000Z");
    const end = new Date("2026-09-01T10:30:00.000Z");

    const result = formatEventTime(start, end, "UTC");

    expect(result.display).toBe("09/01 08:00–10:30");
    expect(result.endIso).toBe(end.toISOString());
  });

  it("converts the displayed time according to Page.timezone", () => {
    const start = new Date("2026-09-01T08:00:00.000Z");

    const result = formatEventTime(start, null, "Asia/Taipei");

    expect(result.display).toBe("09/01 16:00");
  });
});

describe("buildMetaDescription", () => {
  it("includes the title and date range", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-07T00:00:00.000Z");

    expect(buildMetaDescription("市集擺攤週", start, end)).toBe("市集擺攤週｜活動時間 2026-09-01 至 2026-09-07");
  });
});

describe("resolveRobots", () => {
  it("allows indexing only for public pages", () => {
    expect(resolveRobots("public")).toEqual({ index: true, follow: true });
    expect(resolveRobots("unlisted")).toEqual({ index: false, follow: false });
    expect(resolveRobots("unpublished")).toEqual({ index: false, follow: false });
  });
});

describe("shouldIncrementViewCount", () => {
  it("returns true only for pages that render actual content", () => {
    expect(shouldIncrementViewCount("unlisted")).toBe(true);
    expect(shouldIncrementViewCount("public")).toBe(true);
    expect(shouldIncrementViewCount("unpublished")).toBe(false);
  });
});
