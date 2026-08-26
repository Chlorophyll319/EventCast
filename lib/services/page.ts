import { Prisma } from "../generated/prisma/client";
import type { PageStatus, PageTemplate, TagColor } from "../generated/prisma/enums";
import { prisma } from "../prisma";
import { PageLimitError, PageNotFoundError, PageValidationError } from "./pageErrors";
import { validateCreatePageInput, validateSetPageStatusInput, validateUpdatePageInput } from "./pageValidation";
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

export async function updatePage(userId: string, id: string, rawInput: unknown): Promise<PageDetail> {
  const input = validateUpdatePageInput(rawInput);
  const tags = input.tags ?? [];
  const events = input.events ?? [];
  const removeEventIds = input.removeEventIds ?? [];

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.page.findFirst({
        where: { id, userId, deletedAt: null },
        include: { tags: true, events: true },
      });
      if (!existing) {
        throw new PageNotFoundError("Page not found.");
      }

      const existingTagIds = new Set(existing.tags.map((tag) => tag.id));
      const existingEventIds = new Set(existing.events.map((event) => event.id));

      tags.forEach((tag, index) => {
        if (tag.id !== undefined && !existingTagIds.has(tag.id)) {
          throw new PageValidationError(`Tag id '${tag.id}' does not belong to this page.`, `tags[${index}].id`);
        }
      });
      events.forEach((event, index) => {
        if (event.id !== undefined && !existingEventIds.has(event.id)) {
          throw new PageValidationError(
            `Event id '${event.id}' does not belong to this page.`,
            `events[${index}].id`,
          );
        }
      });
      removeEventIds.forEach((eventId, index) => {
        if (!existingEventIds.has(eventId)) {
          throw new PageValidationError(
            `Event id '${eventId}' does not belong to this page.`,
            `removeEventIds[${index}]`,
          );
        }
      });

      // 最終 label 集合（既有 tags 套用本次修改後，再加上本次新增）需唯一，
      // 才能保證後續 events[].tagLabel 解析與 DB 的 @@unique([pageId, label]) 一致。
      const finalLabelByTagId = new Map<string, string>(existing.tags.map((tag) => [tag.id, tag.label]));
      for (const tag of tags) {
        if (tag.id !== undefined) {
          finalLabelByTagId.set(tag.id, tag.label);
        }
      }
      const seenFinalLabels = new Set<string>();
      for (const label of finalLabelByTagId.values()) {
        if (seenFinalLabels.has(label)) {
          throw new PageValidationError(`Duplicate tag label '${label}' after update.`, "tags");
        }
        seenFinalLabels.add(label);
      }
      for (const tag of tags) {
        if (tag.id === undefined) {
          if (seenFinalLabels.has(tag.label)) {
            throw new PageValidationError(`Duplicate tag label '${tag.label}'.`, "tags");
          }
          seenFinalLabels.add(tag.label);
        }
      }

      // 依序套用 tag 修改/新增，同時維護「最終 label → tagId」map 供 events[].tagLabel 解析用。
      const labelToTagId = new Map<string, string>(existing.tags.map((tag) => [tag.label, tag.id]));
      for (const tag of tags) {
        if (tag.id === undefined) {
          continue;
        }
        const previous = existing.tags.find((existingTag) => existingTag.id === tag.id);
        await tx.tag.update({ where: { id: tag.id }, data: { label: tag.label, color: tag.color } });
        if (previous !== undefined) {
          labelToTagId.delete(previous.label);
        }
        labelToTagId.set(tag.label, tag.id);
      }
      for (const tag of tags) {
        if (tag.id !== undefined) {
          continue;
        }
        const created = await tx.tag.create({ data: { pageId: id, label: tag.label, color: tag.color } });
        labelToTagId.set(tag.label, created.id);
      }

      events.forEach((event, index) => {
        if (event.tagLabel !== null && !labelToTagId.has(event.tagLabel)) {
          throw new PageValidationError(
            `tagLabel '${event.tagLabel}' does not match any tag on this page.`,
            `events[${index}].tagLabel`,
          );
        }
      });

      for (const event of events) {
        const tagId = event.tagLabel !== null ? (labelToTagId.get(event.tagLabel) ?? null) : null;
        const eventData = {
          name: event.name,
          startTime: event.startTime,
          endTime: event.endTime,
          tagId,
          location: event.location,
          note: event.note,
        };
        if (event.id !== undefined) {
          await tx.event.update({ where: { id: event.id }, data: eventData });
        } else {
          await tx.event.create({ data: { pageId: id, ...eventData } });
        }
      }

      if (removeEventIds.length > 0) {
        await tx.event.deleteMany({ where: { id: { in: removeEventIds }, pageId: id } });
      }

      const pageUpdateData: Prisma.PageUpdateInput = {};
      if (input.title !== undefined) {
        pageUpdateData.title = input.title;
      }
      if (input.dateRangeStart !== undefined) {
        pageUpdateData.dateRangeStart = input.dateRangeStart;
      }
      if (input.dateRangeEnd !== undefined) {
        pageUpdateData.dateRangeEnd = input.dateRangeEnd;
      }
      if (input.template !== undefined) {
        pageUpdateData.template = input.template;
      }
      if (Object.keys(pageUpdateData).length > 0) {
        await tx.page.update({ where: { id }, data: pageUpdateData });
      }

      const finalPage = await tx.page.findFirst({
        where: { id },
        include: { tags: true, events: { orderBy: { startTime: "asc" } } },
      });
      if (!finalPage) {
        throw new PageNotFoundError("Page not found.");
      }

      return {
        id: finalPage.id,
        slug: finalPage.slug,
        title: finalPage.title,
        dateRangeStart: finalPage.dateRangeStart,
        dateRangeEnd: finalPage.dateRangeEnd,
        template: finalPage.template,
        status: finalPage.status,
        timezone: finalPage.timezone,
        viewCount: finalPage.viewCount,
        createdAt: finalPage.createdAt,
        updatedAt: finalPage.updatedAt,
        tags: finalPage.tags,
        events: finalPage.events,
      };
    });
  } catch (error) {
    if (isTagLabelUniqueConflict(error)) {
      throw new PageValidationError("Tag label must be unique within this page.", "tags");
    }
    throw error;
  }
}

function isTagLabelUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("label");
}

export async function setPageStatus(userId: string, id: string, rawInput: unknown): Promise<PageDetail> {
  const status = validateSetPageStatusInput(rawInput);

  // updateMany 的 where 條件 (id+userId+deletedAt:null) 由 DB 原子性評估，
  // 避免 find 再 update 兩步之間的 race。
  const result = await prisma.page.updateMany({
    where: { id, userId, deletedAt: null },
    data: { status },
  });
  if (result.count === 0) {
    throw new PageNotFoundError("Page not found.");
  }

  const page = await getPageById(userId, id);
  if (!page) {
    throw new PageNotFoundError("Page not found.");
  }
  return page;
}

export async function deletePage(userId: string, id: string): Promise<void> {
  const result = await prisma.page.updateMany({
    where: { id, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) {
    throw new PageNotFoundError("Page not found.");
  }
}
