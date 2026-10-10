import { api } from "@/services/axios";

export interface AdminActivity {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  title: string;
  description: string;
  createdAt: string;
  actor: {
    id: string | null;
    name: string;
    email: string | null;
    role: string | null;
  };
  metadata: Record<string, unknown>;
}

export interface AdminActivityPage {
  activities: AdminActivity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AdminActivityFilters {
  page?: number;
  limit?: number;
  entityType?: string;
  action?: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function text(source: UnknownRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function numberValue(source: UnknownRecord, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function findRows(value: unknown): unknown[] {
  const queue: unknown[] = [value];
  const visited = new Set<object>();

  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) return current;
    if (!current || typeof current !== "object" || visited.has(current))
      continue;
    visited.add(current);
    const source = record(current);
    for (const key of [
      "activities",
      "activityLogs",
      "logs",
      "items",
      "results",
      "data",
    ]) {
      if (Array.isArray(source[key])) return source[key] as unknown[];
    }
    for (const key of ["data", "result", "payload"]) {
      const candidate = source[key];
      if (candidate && typeof candidate === "object") queue.push(candidate);
    }
  }
  return [];
}

function findPagination(value: unknown): UnknownRecord {
  const queue: unknown[] = [value];
  const visited = new Set<object>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current))
      continue;
    visited.add(current);
    const source = record(current);
    const pagination = source.pagination ?? source.meta;
    if (pagination && typeof pagination === "object") return record(pagination);
    for (const key of ["data", "result", "payload"]) {
      const candidate = source[key];
      if (candidate && typeof candidate === "object") queue.push(candidate);
    }
  }
  return {};
}

function findActivity(value: unknown): unknown {
  const queue: unknown[] = [value];
  const visited = new Set<object>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current))
      continue;
    visited.add(current);
    const source = record(current);
    if (
      typeof source.action === "string" ||
      typeof source.activityType === "string" ||
      typeof source.activityId === "string"
    ) {
      return current;
    }
    for (const key of ["activity", "data", "result", "payload"]) {
      const candidate = source[key];
      if (candidate && typeof candidate === "object") queue.push(candidate);
    }
  }
  return value;
}

function normalizeActivity(value: unknown, index = 0): AdminActivity {
  const source = record(value);
  const metadata = {
    // Retain transaction fields that some activity responses expose directly
    // on the row instead of inside metadata/details/data.
    ...source,
    ...record(source.details),
    ...record(source.metadata),
    ...record(source.data),
  };
  const actorSource = {
    ...record(source.user),
    ...record(source.actor),
    ...record(source.performedBy),
  };
  const action = text(
    source,
    ["action", "activityType", "event", "eventType", "type"],
    "ACTIVITY",
  ).toUpperCase();
  const entityType = text(
    source,
    ["entityType", "resourceType", "subjectType"],
    text(metadata, ["entityType"], "GENERAL"),
  ).toUpperCase();
  const actorName = text(
    actorSource,
    ["fullName", "name", "businessName"],
    text(source, ["userName", "actorName"], "System"),
  );
  const title = text(
    source,
    ["title", "summary"],
    activityTitle(action, entityType, actorName),
  );

  return {
    id: text(source, ["id", "activityId", "_id"], `activity-${index}`),
    action,
    entityType,
    entityId:
      text(
        source,
        ["entityId", "resourceId", "subjectId"],
        text(metadata, [
          "entityId",
          "propertyId",
          "inspectionId",
          "bookingId",
          "userId",
        ]),
      ) || null,
    title,
    description: text(
      source,
      ["description", "message"],
      text(metadata, ["description", "message"], humanize(action)),
    ),
    createdAt: text(
      source,
      [
        "createdAt",
        "created_at",
        "timeline",
        "timestamp",
        "occurredAt",
        "occurred_at",
        "eventTime",
        "event_time",
        "updatedAt",
        "updated_at",
      ],
      text(metadata, [
        "createdAt",
        "created_at",
        "timeline",
        "timestamp",
        "occurredAt",
        "occurred_at",
        "eventTime",
        "event_time",
        "updatedAt",
        "updated_at",
      ]),
    ),
    actor: {
      id:
        text(
          actorSource,
          ["id", "userId"],
          text(source, ["userId", "actorId"]),
        ) || null,
      name: actorName,
      email:
        text(
          actorSource,
          ["email"],
          text(source, ["userEmail", "actorEmail"]),
        ) || null,
      role:
        text(actorSource, ["role"], text(source, ["userRole", "actorRole"])) ||
        null,
    },
    metadata,
  };
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityTitle(action: string, entityType: string, actor: string) {
  if (/REGISTER|CREATE_USER|SIGN_UP/.test(action))
    return `${actor} joined the platform`;
  if (/NIN|KYC|VERIFICATION/.test(`${action} ${entityType}`)) {
    return `${actor} submitted KYC verification`;
  }
  if (/CREATE_PROPERTY|SUBMIT_PROPERTY|LIST_PROPERTY/.test(action))
    return `${actor} submitted a property listing`;
  if (/INSPECTION|INQUIRY|VIEWING/.test(`${action} ${entityType}`))
    return `${actor} booked an inspection`;
  if (/PAYMENT|TRANSACTION|ESCROW/.test(`${action} ${entityType}`))
    return `${actor} made a payment`;
  if (/BOOKING|SHORTLET/.test(`${action} ${entityType}`))
    return `${actor} created a shortlet booking`;
  return `${actor}: ${humanize(action)}`;
}

function unwrapPage(
  value: unknown,
  requestedPage: number,
  requestedLimit: number,
): AdminActivityPage {
  const rows = findRows(value);
  const pagination = findPagination(value);
  const activities = rows
    .map(normalizeActivity)
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
    );
  const total = numberValue(
    pagination,
    ["total", "totalItems", "count"],
    activities.length,
  );
  const limit = numberValue(pagination, ["limit", "pageSize"], requestedLimit);

  return {
    activities,
    pagination: {
      page: numberValue(pagination, ["page", "currentPage"], requestedPage),
      limit,
      total,
      pages: numberValue(
        pagination,
        ["pages", "totalPages"],
        Math.max(1, Math.ceil(total / limit)),
      ),
    },
  };
}

export const activityService = {
  getAll: async ({
    page = 1,
    limit = 20,
    entityType,
    action,
  }: AdminActivityFilters = {}) => {
    const { data } = await api.get<unknown>("/activity", {
      params: {
        page,
        limit,
        entityType: entityType || undefined,
        action: action || undefined,
      },
    });
    return unwrapPage(data, page, limit);
  },

  getById: async (activityId: string) => {
    const { data } = await api.get<unknown>(
      `/activity/${encodeURIComponent(activityId)}`,
    );
    return normalizeActivity(findActivity(data));
  },
};
