import { describe, expect, it } from "vitest";
import {
  buildMetaDescription,
  formatDateRange,
  formatEventTime,
  groupEventsByDay,
  resolveRobots,
  shouldIncrementViewCount,
} from "./format";

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

  it("exposes a timeOnly field without the date, for use under a day grouping", () => {
    const start = new Date("2026-09-01T08:00:00.000Z");
    const end = new Date("2026-09-01T10:30:00.000Z");

    expect(formatEventTime(start, null, "UTC").timeOnly).toBe("08:00");
    expect(formatEventTime(start, end, "UTC").timeOnly).toBe("08:00–10:30");
  });
});

describe("groupEventsByDay", () => {
  it("returns an empty array for no events", () => {
    expect(groupEventsByDay([], "UTC")).toEqual([]);
  });

  it("groups consecutive same-day events into one group", () => {
    const events = [
      { startTime: new Date("2026-09-01T08:00:00.000Z") },
      { startTime: new Date("2026-09-01T12:00:00.000Z") },
    ];

    const groups = groupEventsByDay(events, "UTC");

    expect(groups).toHaveLength(1);
    expect(groups[0].dayLabel).toBe("09/01");
    expect(groups[0].events).toHaveLength(2);
  });

  it("splits events across days into separate groups, in order", () => {
    const events = [
      { startTime: new Date("2026-09-01T08:00:00.000Z") },
      { startTime: new Date("2026-09-02T08:00:00.000Z") },
    ];

    const groups = groupEventsByDay(events, "UTC");

    expect(groups.map((group) => group.dayLabel)).toEqual(["09/01", "09/02"]);
    expect(groups[0].events).toHaveLength(1);
    expect(groups[1].events).toHaveLength(1);
  });

  it("shifts the grouping day across a day boundary for a non-UTC timezone", () => {
    // 23:30 UTC = 07:30 next day in Asia/Taipei (+8)，分組日期應依當地日期而非 UTC 日期。
    const events = [{ startTime: new Date("2026-08-31T23:30:00.000Z") }];

    const groups = groupEventsByDay(events, "Asia/Taipei");

    expect(groups[0].dayLabel).toBe("09/01");
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
