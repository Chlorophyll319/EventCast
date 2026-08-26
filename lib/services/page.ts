import { Prisma } from "../generated/prisma/client";
import type { PageStatus, PageTemplate, TagColor } from "../generated/prisma/enums";
import { prisma } from "../prisma";
import { PageLimitError } from "./pageErrors";
import { validateCreatePageInput } from "./pageValidation";
import { generateUniquePageSlug, SlugGenerationError } from "./slug";

const PAGE_LIMIT = 10;
const MAX_CREATE_ATTEMPTS = 5;
// AI/MCP 呼叫沒有「建立者裝置」可依循（data-model.md 的 timezone 規則是為瀏覽器建立情境設計的），
// MVP 階段先固定回填 UTC；之後若後台開放手動建立頁面，需要改成讀取當下裝置時區。
const DEFAULT_TIMEZONE = "UTC";

export interface PageTag {
  id: string;
  label: string;
  color: TagColor;
}

export interface PageEvent {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  tagId: string | null;
  location: string | null;
  note: string | null;
}

export interface PageDetail {
  id: string;
  slug: string;
  title: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  template: PageTemplate;
  status: PageStatus;
  timezone: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  tags: PageTag[];
  events: PageEvent[];
}

export async function createPage(userId: string, rawInput: unknown): Promise<PageDetail> {
  const input = validateCreatePageInput(rawInput);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const slug = await generateUniquePageSlug();
    try {
      return await prisma.$transaction(async (tx) => {
        // Page 數量上限在併發下有極低機率的 race（兩個請求同時通過此檢查），
        // MVP 階段接受此已知限制，不引入 serializable transaction／列鎖。
        const activeCount = await tx.page.count({ where: { userId, deletedAt: null } });
        if (activeCount >= PAGE_LIMIT) {
          throw new PageLimitError(`User has reached the maximum of ${PAGE_LIMIT} pages.`);
        }

        const page = await tx.page.create({
          data: {
            userId,
            slug,
            title: input.title,
            dateRangeStart: input.dateRangeStart,
            dateRangeEnd: input.dateRangeEnd,
            template: input.template,
            timezone: DEFAULT_TIMEZONE,
          },
        });

        const tags: PageTag[] = [];
        const tagIdByLabel = new Map<string, string>();
        for (const tag of input.tags) {
          const createdTag = await tx.tag.create({
            data: { pageId: page.id, label: tag.label, color: tag.color },
          });
          tagIdByLabel.set(tag.label, createdTag.id);
          tags.push(createdTag);
        }

        const events: PageEvent[] = [];
        for (const event of input.events) {
          const createdEvent = await tx.event.create({
            data: {
              pageId: page.id,
              name: event.name,
              startTime: event.startTime,
              endTime: event.endTime,
              tagId: event.tagLabel ? (tagIdByLabel.get(event.tagLabel) ?? null) : null,
              location: event.location,
              note: event.note,
            },
          });
          events.push(createdEvent);
        }
        events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        return {
          id: page.id,
          slug: page.slug,
          title: page.title,
          dateRangeStart: page.dateRangeStart,
          dateRangeEnd: page.dateRangeEnd,
          template: page.template,
          status: page.status,
          timezone: page.timezone,
          viewCount: page.viewCount,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          tags,
          events,
        };
      });
    } catch (error) {
      lastError = error;
      if (isSlugUniqueConflict(error) && attempt < MAX_CREATE_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new SlugGenerationError("Failed to create page.");
}

export interface PageSummary {
  id: string;
  slug: string;
  title: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  template: PageTemplate;
  status: PageStatus;
  timezone: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listPages(userId: string): Promise<PageSummary[]> {
  return prisma.page.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      dateRangeStart: true,
      dateRangeEnd: true,
      template: true,
      status: true,
      timezone: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getPageById(userId: string, id: string): Promise<PageDetail | null> {
  // id/userId/deletedAt 一起查，查無論是「不存在」或「非本人所有」一律回傳 null，
  // 由呼叫端統一轉成 404，不洩漏其他使用者的頁面是否存在。
  const page = await prisma.page.findFirst({
    where: { id, userId, deletedAt: null },
    include: {
      tags: true,
      events: { orderBy: { startTime: "asc" } },
    },
  });
  if (!page) {
    return null;
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    dateRangeStart: page.dateRangeStart,
    dateRangeEnd: page.dateRangeEnd,
    template: page.template,
    status: page.status,
    timezone: page.timezone,
    viewCount: page.viewCount,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    tags: page.tags,
    events: page.events,
  };
}

function isSlugUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("slug");
}
