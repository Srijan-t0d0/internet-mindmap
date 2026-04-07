import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { SourceType } from "@internet-mindmap/shared";

type ItemStatus = "pending" | "processing" | "ready" | "error";

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type").$type<SourceType>().notNull(),
    rawContent: text("raw_content"),
    summary: text("summary"),
    keyPassages: text("key_passages"), // JSON array string
    vectorizeId: text("vectorize_id"),
    status: text("status").$type<ItemStatus>().notNull().default("pending"),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    lastError: text("last_error"),
    errorCount: integer("error_count").notNull().default(0),
    author: text("author"),
    published: text("published"),
    description: text("description"),
    siteName: text("site_name"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
    updatedAt: text("updated_at").notNull().default("(datetime('now'))"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("items_source_type_idx").on(table.sourceType),
    index("items_status_idx").on(table.status),
    index("items_created_at_idx").on(table.createdAt),
    index("items_is_read_idx").on(table.isRead),
    uniqueIndex("items_user_url_unique").on(table.userId, table.url),
    index("items_user_id_idx").on(table.userId),
  ]
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
  },
  (table) => [index("tags_name_idx").on(table.name)]
);

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("auto"),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.tagId] })]
);

// ── Better Auth tables ─────────────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ── Usage tracking ─────────────────────────────────────────────────────────

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(),
    source: text("source"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    metadata: text("metadata"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    index("usage_events_user_id_idx").on(table.userId),
    index("usage_events_user_type_idx").on(table.userId, table.eventType),
    index("usage_events_user_date_idx").on(table.userId, table.createdAt),
  ]
);

export const apiKey = sqliteTable("apiKey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull().unique(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: integer("lastRefillAt", { mode: "timestamp" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  rateLimitEnabled: integer("rateLimitEnabled", { mode: "boolean" }).notNull().default(false),
  rateLimitTimeWindow: integer("rateLimitTimeWindow"),
  rateLimitMax: integer("rateLimitMax"),
  requestCount: integer("requestCount").notNull().default(0),
  remaining: integer("remaining"),
  lastRequest: integer("lastRequest", { mode: "timestamp" }),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
});
