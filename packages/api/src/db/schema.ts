import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull(),
    rawContent: text("raw_content"),
    summary: text("summary"),
    keyPassages: text("key_passages"), // JSON array string
    vectorizeId: text("vectorize_id"),
    status: text("status").notNull().default("pending"),
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
  },
  (table) => [
    index("items_source_type_idx").on(table.sourceType),
    index("items_status_idx").on(table.status),
    index("items_created_at_idx").on(table.createdAt),
    index("items_is_read_idx").on(table.isRead),
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
