import { PageStatus, PageTemplate, TagColor } from "../generated/prisma/enums";
import { PageValidationError } from "./pageErrors";

const TITLE_MAX_LENGTH = 100;
const EVENT_NAME_MAX_LENGTH = 100;
const LOCATION_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 500;

const PAGE_TEMPLATES = new Set<string>(Object.values(PageTemplate));
const TAG_COLORS = new Set<string>(Object.values(TagColor));
const PAGE_STATUSES = new Set<string>(Object.values(PageStatus));

export interface ValidatedTag {
  label: string;
  color: TagColor;
}

export interface ValidatedEvent {
  name: string;
  startTime: Date;
  endTime: Date | null;
  tagLabel: string | null;
  location: string | null;
  note: string | null;
}

export interface ValidatedCreatePageInput {
  title: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  template: PageTemplate;
  tags: ValidatedTag[];
  events: ValidatedEvent[];
}

export function validateCreatePageInput(body: unknown): ValidatedCreatePageInput {
  if (typeof body !== "object" || body === null) {
    throw new PageValidationError("Request body must be a JSON object.", "body");
  }
  const input = body as Record<string, unknown>;

  const title = validateRequiredString(input.title, "title", TITLE_MAX_LENGTH);
  const dateRangeStart = validateRequiredDate(input.dateRangeStart, "dateRangeStart");
  const dateRangeEnd = validateRequiredDate(input.dateRangeEnd, "dateRangeEnd");
  const template = validateTemplate(input.template);
  const tags = validateTags(input.tags);
  const events = validateEvents(input.events, tags);

  return { title, dateRangeStart, dateRangeEnd, template, tags, events };
}

function validateRequiredString(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PageValidationError(`${field} is required and must be a non-empty string.`, field);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new PageValidationError(`${field} must be at most ${maxLength} characters.`, field);
  }
  return value;
}

function validateOptionalString(value: unknown, field: string, maxLength?: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new PageValidationError(`${field} must be a string.`, field);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new PageValidationError(`${field} must be at most ${maxLength} characters.`, field);
  }
  return value;
}

function validateRequiredDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PageValidationError(`${field} must be a valid ISO date string.`, field);
  }
  return new Date(value);
}

function validateOptionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new PageValidationError(`${field} must be a valid ISO date string.`, field);
  }
  return new Date(value);
}

function validateTemplate(value: unknown): PageTemplate {
  if (typeof value !== "string" || !PAGE_TEMPLATES.has(value)) {
    throw new PageValidationError("template must be one of the allowed values.", "template");
  }
  return value as PageTemplate;
}

function validateTagColor(value: unknown, field: string): TagColor {
  if (typeof value !== "string" || !TAG_COLORS.has(value)) {
    throw new PageValidationError("color must be one of the allowed values.", field);
  }
  return value as TagColor;
}

function validateTags(value: unknown): ValidatedTag[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PageValidationError("tags must be an array.", "tags");
  }

  const seenLabels = new Set<string>();
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new PageValidationError("Each tag must be an object.", `tags[${index}]`);
    }
    const tag = raw as Record<string, unknown>;
    const label = validateRequiredString(tag.label, `tags[${index}].label`);
    if (seenLabels.has(label)) {
      throw new PageValidationError(`Duplicate tag label '${label}'.`, `tags[${index}].label`);
    }
    seenLabels.add(label);
    const color = validateTagColor(tag.color, `tags[${index}].color`);
    return { label, color };
  });
}

function validateEvents(value: unknown, tags: ValidatedTag[]): ValidatedEvent[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new PageValidationError("events must be an array.", "events");
  }

  const tagLabels = new Set(tags.map((tag) => tag.label));

  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new PageValidationError("Each event must be an object.", `events[${index}]`);
    }
    const event = raw as Record<string, unknown>;
    const name = validateRequiredString(event.name, `events[${index}].name`, EVENT_NAME_MAX_LENGTH);
    const startTime = validateRequiredDate(event.startTime, `events[${index}].startTime`);
    const endTime = validateOptionalDate(event.endTime, `events[${index}].endTime`);
    const location = validateOptionalString(event.location, `events[${index}].location`, LOCATION_MAX_LENGTH);
    const note = validateOptionalString(event.note, `events[${index}].note`, NOTE_MAX_LENGTH);
    const tagLabel = validateOptionalString(event.tagLabel, `events[${index}].tagLabel`);

    if (tagLabel !== null && !tagLabels.has(tagLabel)) {
      throw new PageValidationError(
        `tagLabel '${tagLabel}' does not match any tag in this request.`,
        `events[${index}].tagLabel`,
      );
    }

    return { name, startTime, endTime, tagLabel, location, note };
  });
}

export interface ValidatedUpdateTag {
  id?: string;
  label: string;
  color: TagColor;
}

export interface ValidatedUpdateEvent {
  id?: string;
  name: string;
  startTime: Date;
  endTime: Date | null;
  tagLabel: string | null;
  location: string | null;
  note: string | null;
}

export interface ValidatedUpdatePageInput {
  title?: string;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  template?: PageTemplate;
  tags?: ValidatedUpdateTag[];
  events?: ValidatedUpdateEvent[];
  removeEventIds?: string[];
}

// 純格式驗證，不查 DB：tags[]/events[] 的 id 是否真的屬於此 Page、
// events[].tagLabel 是否能解析到實際 tagId，皆留給 service 層在 transaction 內處理。
export function validateUpdatePageInput(body: unknown): ValidatedUpdatePageInput {
  if (typeof body !== "object" || body === null) {
    throw new PageValidationError("Request body must be a JSON object.", "body");
  }
  const input = body as Record<string, unknown>;
  const result: ValidatedUpdatePageInput = {};

  if (input.title !== undefined) {
    result.title = validateRequiredString(input.title, "title", TITLE_MAX_LENGTH);
  }
  if (input.dateRangeStart !== undefined) {
    result.dateRangeStart = validateRequiredDate(input.dateRangeStart, "dateRangeStart");
  }
  if (input.dateRangeEnd !== undefined) {
    result.dateRangeEnd = validateRequiredDate(input.dateRangeEnd, "dateRangeEnd");
  }
  if (input.template !== undefined) {
    result.template = validateTemplate(input.template);
  }
  if (input.tags !== undefined) {
    result.tags = validateUpdateTags(input.tags);
  }
  if (input.events !== undefined) {
    result.events = validateUpdateEvents(input.events);
  }
  if (input.removeEventIds !== undefined) {
    result.removeEventIds = validateRemoveEventIds(input.removeEventIds, result.events ?? []);
  }

  return result;
}

export function validateSetPageStatusInput(body: unknown): PageStatus {
  if (typeof body !== "object" || body === null) {
    throw new PageValidationError("Request body must be a JSON object.", "body");
  }
  const input = body as Record<string, unknown>;
  if (typeof input.status !== "string" || !PAGE_STATUSES.has(input.status)) {
    throw new PageValidationError("status must be one of the allowed values.", "status");
  }
  return input.status as PageStatus;
}

function validateOptionalId(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new PageValidationError(`${field} must be a non-empty string.`, field);
  }
  return value;
}

function validateUpdateTags(value: unknown): ValidatedUpdateTag[] {
  if (!Array.isArray(value)) {
    throw new PageValidationError("tags must be an array.", "tags");
  }

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new PageValidationError("Each tag must be an object.", `tags[${index}]`);
    }
    const tag = raw as Record<string, unknown>;
    const id = validateOptionalId(tag.id, `tags[${index}].id`);
    if (id !== undefined) {
      if (seenIds.has(id)) {
        throw new PageValidationError(`Duplicate tag id '${id}'.`, `tags[${index}].id`);
      }
      seenIds.add(id);
    }
    const label = validateRequiredString(tag.label, `tags[${index}].label`);
    if (seenLabels.has(label)) {
      throw new PageValidationError(`Duplicate tag label '${label}'.`, `tags[${index}].label`);
    }
    seenLabels.add(label);
    const color = validateTagColor(tag.color, `tags[${index}].color`);
    return { id, label, color };
  });
}

function validateUpdateEvents(value: unknown): ValidatedUpdateEvent[] {
  if (!Array.isArray(value)) {
    throw new PageValidationError("events must be an array.", "events");
  }

  const seenIds = new Set<string>();
  return value.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new PageValidationError("Each event must be an object.", `events[${index}]`);
    }
    const event = raw as Record<string, unknown>;
    const id = validateOptionalId(event.id, `events[${index}].id`);
    if (id !== undefined) {
      if (seenIds.has(id)) {
        throw new PageValidationError(`Duplicate event id '${id}'.`, `events[${index}].id`);
      }
      seenIds.add(id);
    }
    const name = validateRequiredString(event.name, `events[${index}].name`, EVENT_NAME_MAX_LENGTH);
    const startTime = validateRequiredDate(event.startTime, `events[${index}].startTime`);
    const endTime = validateOptionalDate(event.endTime, `events[${index}].endTime`);
    const location = validateOptionalString(event.location, `events[${index}].location`, LOCATION_MAX_LENGTH);
    const note = validateOptionalString(event.note, `events[${index}].note`, NOTE_MAX_LENGTH);
    const tagLabel = validateOptionalString(event.tagLabel, `events[${index}].tagLabel`);

    return { id, name, startTime, endTime, tagLabel, location, note };
  });
}

function validateRemoveEventIds(value: unknown, events: ValidatedUpdateEvent[]): string[] {
  if (!Array.isArray(value)) {
    throw new PageValidationError("removeEventIds must be an array.", "removeEventIds");
  }

  const editedIds = new Set(events.filter((event) => event.id !== undefined).map((event) => event.id as string));
  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (typeof raw !== "string" || raw.length === 0) {
      throw new PageValidationError(
        `removeEventIds[${index}] must be a non-empty string.`,
        `removeEventIds[${index}]`,
      );
    }
    if (seen.has(raw)) {
      throw new PageValidationError(`Duplicate id '${raw}' in removeEventIds.`, `removeEventIds[${index}]`);
    }
    seen.add(raw);
    if (editedIds.has(raw)) {
      throw new PageValidationError(
        `Event id '${raw}' cannot appear in both events and removeEventIds.`,
        `removeEventIds[${index}]`,
      );
    }
    return raw;
  });
}
