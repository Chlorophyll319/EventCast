import type { PageStatus } from "@/lib/generated/prisma/enums";

const DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = DATE_FORMATTER_CACHE.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  DATE_FORMATTER_CACHE.set(timezone, formatter);
  return formatter;
}

const MONTH_DAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getMonthDayFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = MONTH_DAY_FORMATTER_CACHE.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
  });
  MONTH_DAY_FORMATTER_CACHE.set(timezone, formatter);
  return formatter;
}

const TIME_ONLY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getTimeOnlyFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = TIME_ONLY_FORMATTER_CACHE.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  TIME_ONLY_FORMATTER_CACHE.set(timezone, formatter);
  return formatter;
}

// 依 Page.timezone 換算顯示，不做訪客當地時區轉換（FRD.md 時區處理規則）。
export function formatDateRange(dateRangeStart: Date, dateRangeEnd: Date, timezone: string): string {
  const formatter = getDateFormatter(timezone);
  return `${formatter.format(dateRangeStart)} – ${formatter.format(dateRangeEnd)}`;
}

export interface FormattedEventTime {
  display: string;
  startIso: string;
  endIso: string | null;
}

export function formatEventTime(startTime: Date, endTime: Date | null, timezone: string): FormattedEventTime {
  // 分開組 月/日 與 時:分（而非用單一 formatter 混合輸出），避免不同 JS runtime 的 ICU
  // 對 Intl.DateTimeFormat 混合 date+time 選項插入的分隔空白字元（例如 U+2009 THIN SPACE）不一致。
  const startDisplay = `${getMonthDayFormatter(timezone).format(startTime)} ${getTimeOnlyFormatter(timezone).format(startTime)}`;
  const display = endTime ? `${startDisplay}–${getTimeOnlyFormatter(timezone).format(endTime)}` : startDisplay;

  return {
    display,
    startIso: startTime.toISOString(),
    endIso: endTime ? endTime.toISOString() : null,
  };
}

export function buildMetaDescription(title: string, dateRangeStart: Date, dateRangeEnd: Date): string {
  const start = dateRangeStart.toISOString().slice(0, 10);
  const end = dateRangeEnd.toISOString().slice(0, 10);
  return `${title}｜活動時間 ${start} 至 ${end}`;
}

export interface RobotsDirective {
  index: boolean;
  follow: boolean;
}

// public 才允許索引；unlisted 靠 slug 不可預測保護「連結才能看」、unpublished 是下架頁，兩者皆 noindex。
export function resolveRobots(status: PageStatus): RobotsDirective {
  const canIndex = status === "public";
  return { index: canIndex, follow: canIndex };
}

// 僅在頁面仍可瀏覽（unlisted/public）且成功渲染活動內容時才計入 viewCount。
export function shouldIncrementViewCount(status: PageStatus): boolean {
  return status === "unlisted" || status === "public";
}
