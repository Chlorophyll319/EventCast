import { z } from "zod";
import type { ApiTokenScope } from "../generated/prisma/enums";
import { PageStatus, PageTemplate, TagColor } from "../generated/prisma/enums";
import { createPage, deletePage, getPageById, listPages, setPageStatus, updatePage } from "./page";
import { PageLimitError, PageNotFoundError, PageValidationError } from "./pageErrors";

function enumValues<T extends string>(source: Record<string, T>): [T, ...T[]] {
  return Object.values(source) as [T, ...T[]];
}

const templateValues = enumValues(PageTemplate);
const tagColorValues = enumValues(TagColor);
const statusValues = enumValues(PageStatus);

// 只描述欄位「型別」給 LLM 看，不重複 lib/services/pageValidation.ts 的業務規則（長度上限、
// label 唯一性等）——那些規則由 createPage/updatePage/setPageStatus 內部驗證，唯一權威來源。
const tagCreateShape = z.object({
  label: z.string().describe("Tag label, unique within the page."),
  color: z.enum(tagColorValues).describe("Tag color."),
});

const eventCreateShape = z.object({
  name: z.string().describe("Event name."),
  startTime: z.string().describe("ISO 8601 datetime string."),
  endTime: z.string().nullable().optional().describe("ISO 8601 datetime string, or null."),
  tagLabel: z.string().nullable().optional().describe("Must match a label in this request's tags[]."),
  location: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const createPageInput = z.object({
  title: z.string().describe("Page title."),
  dateRangeStart: z.string().describe("ISO 8601 date string."),
  dateRangeEnd: z.string().describe("ISO 8601 date string."),
  template: z.enum(templateValues).describe("Page layout template."),
  tags: z.array(tagCreateShape).optional().describe("Tags to create for this page."),
  events: z.array(eventCreateShape).optional().describe("Events to create for this page."),
});

const tagUpdateShape = z.object({
  id: z.string().optional().describe("Existing tag id to modify; omit to create a new tag."),
  label: z.string().describe("Tag label, unique within the page."),
  color: z.enum(tagColorValues).describe("Tag color."),
});

const eventUpdateShape = z.object({
  id: z.string().optional().describe("Existing event id to modify; omit to create a new event."),
  name: z.string().describe("Event name."),
  startTime: z.string().describe("ISO 8601 datetime string."),
  endTime: z.string().nullable().optional(),
  tagLabel: z.string().nullable().optional().describe("Must match a label in tags[] or the page's existing tags."),
  location: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const updatePageInput = z.object({
  id: z.string().describe("Page id to update."),
  title: z.string().optional(),
  dateRangeStart: z.string().optional().describe("ISO 8601 date string."),
  dateRangeEnd: z.string().optional().describe("ISO 8601 date string."),
  template: z.enum(templateValues).optional(),
  tags: z
    .array(tagUpdateShape)
    .optional()
    .describe("Tags to modify (with id) or create (without id)."),
  events: z
    .array(eventUpdateShape)
    .optional()
    .describe("Events to modify (with id) or create (without id)."),
  removeEventIds: z.array(z.string()).optional().describe("Event ids to delete from this page."),
});

const setPageStatusInput = z.object({
  id: z.string().describe("Page id."),
  status: z.enum(statusValues).describe("New status: unlisted, public, or unpublished."),
});

const pageIdInput = z.object({
  id: z.string().describe("Page id."),
});

const listPagesInput = z.object({});

function withPublicUrl<T extends { slug: string }>(page: T): T & { url: string } {
  return { ...page, url: `${process.env.APP_BASE_URL}/p/${page.slug}` };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  requiredScope: ApiTokenScope;
  inputSchema: z.ZodRawShape;
  execute: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "create_page",
    description: "Create a new event page, optionally with tags and events.",
    requiredScope: "write",
    inputSchema: createPageInput.shape,
    execute: async (userId, args) => withPublicUrl(await createPage(userId, args)),
  },
  {
    name: "list_pages",
    description: "List the caller's event pages (excludes soft-deleted pages).",
    requiredScope: "read",
    inputSchema: listPagesInput.shape,
    execute: async (userId) => ({ pages: (await listPages(userId)).map(withPublicUrl) }),
  },
  {
    name: "get_page",
    description: "Get a single event page by id.",
    requiredScope: "read",
    inputSchema: pageIdInput.shape,
    execute: async (userId, args) => {
      const { id } = args as { id: string };
      const page = await getPageById(userId, id);
      if (!page) {
        throw new PageNotFoundError("Page not found.");
      }
      return withPublicUrl(page);
    },
  },
  {
    name: "update_page",
    description:
      "Partially update a page's fields, tags, and events. tags[]/events[] entries with an id are " +
      "modified, entries without an id are created; use removeEventIds to delete events.",
    requiredScope: "write",
    inputSchema: updatePageInput.shape,
    execute: async (userId, args) => {
      const { id, ...rest } = args as { id: string } & Record<string, unknown>;
      return withPublicUrl(await updatePage(userId, id, rest));
    },
  },
  {
    name: "set_page_status",
    description: "Switch a page's visibility status (unlisted / public / unpublished).",
    requiredScope: "write",
    inputSchema: setPageStatusInput.shape,
    execute: async (userId, args) => {
      const { id, status } = args as { id: string; status: string };
      return withPublicUrl(await setPageStatus(userId, id, { status }));
    },
  },
  {
    name: "delete_page",
    description: "Soft-delete a page.",
    requiredScope: "write",
    inputSchema: pageIdInput.shape,
    execute: async (userId, args) => {
      const { id } = args as { id: string };
      await deletePage(userId, id);
      return { id, deleted: true };
    },
  },
];

export function findMcpTool(name: string): McpToolDefinition | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export interface McpToolErrorResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    error: { code: "VALIDATION_ERROR" | "NOT_FOUND"; message: string; field?: string };
  };
  isError: true;
}

// 只涵蓋 page service 實際會拋出的錯誤類型；UNAUTHORIZED/RATE_LIMITED 在 route.ts 的
// 進入點驗證階段就已攔截，不會流到這裡（對齊 app/api/pages/shared.ts 的 mapPageError 語意）。
export function mapErrorToMcpContent(error: unknown): McpToolErrorResult {
  if (error instanceof PageValidationError) {
    return buildErrorResult("VALIDATION_ERROR", error.message, error.field);
  }
  if (error instanceof PageLimitError) {
    return buildErrorResult("VALIDATION_ERROR", error.message);
  }
  if (error instanceof PageNotFoundError) {
    return buildErrorResult("NOT_FOUND", error.message);
  }
  throw error;
}

function buildErrorResult(
  code: "VALIDATION_ERROR" | "NOT_FOUND",
  message: string,
  field?: string,
): McpToolErrorResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: { error: field !== undefined ? { code, message, field } : { code, message } },
    isError: true,
  };
}
