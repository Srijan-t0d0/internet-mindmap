import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  primaryKey,
  uniqueIndex,
  vector,
  jsonb,
} from "drizzle-orm/pg-core";
import type { EmbeddingModality, SourceType } from "@internet-mindmap/shared";
import type { UIMessagePart } from "ai";

type ItemStatus = "pending" | "processing" | "ready" | "error";

type EmbeddingJobStatus = "pending" | "done" | "failed";

export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type").$type<SourceType>().notNull(),
    rawContent: text("raw_content"),
    summary: text("summary"),
    keyPassages: jsonb("key_passages").$type<string[]>(),
    chunkCount: integer("chunk_count").notNull().default(0),
    status: text("status").$type<ItemStatus>().notNull().default("pending"),
    isRead: boolean("is_read").notNull().default(false),
    lastError: text("last_error"),
    errorCount: integer("error_count").notNull().default(0),
    author: text("author"),
    published: text("published"),
    description: text("description"),
    siteName: text("site_name"),
    notes: text("notes"),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("items_source_type_idx").on(table.sourceType),
    index("items_status_idx").on(table.status),
    index("items_created_at_idx").on(table.createdAt),
    index("items_is_read_idx").on(table.isRead),
    uniqueIndex("items_user_url_unique").on(table.userId, table.url),
    index("items_user_id_idx").on(table.userId),
    index("items_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ]
);

// ── Chunk vectors ─────────────────────────────────────────────────────────────
// One row per chunk of rawContent (long articles). id = "${itemId}-c-${i}".
// Cascade-deleted automatically when the parent item is deleted.
export const itemChunks = pgTable(
  "item_chunks",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (table) => [
    index("item_chunks_item_id_idx").on(table.itemId),
    index("item_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  ]
);

// ── Embedding inputs (migration-proof source of truth) ───────────────────────
// The *pure-function input* to whichever embedder we ran. Re-embedding a
// corpus with a new model becomes: read this table, call new provider,
// insert into the new destination. No re-scraping, no content re-extraction.
//
// One row per (item, modality, chunk_index). For a short article that fits
// in one embed call we store chunk_index=0 with the whole enriched text.
// For a long article we store chunk_index=0..N with each chunk's text.
// Image / video rows store an R2 key in `content` instead of inline text.
export const embeddingInputs = pgTable(
  "embedding_inputs",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    modality: text("modality").$type<EmbeddingModality>().notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    // For text: the inline string. For image/video: an R2 key or URL.
    content: text("content").notNull(),
    // sha256 of content. Lets `embedding_jobs` skip work when input hasn't changed.
    contentHash: text("content_hash").notNull(),
    // Stable id of the chunker used, e.g. "char-6k-500" or "whole-doc-enriched".
    // Stored so a later model can decide whether to re-chunk.
    chunkerId: text("chunker_id").notNull(),
    chunkerVersion: text("chunker_version").notNull().default("1"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("embedding_inputs_item_id_idx").on(table.itemId),
    index("embedding_inputs_content_hash_idx").on(table.contentHash),
    uniqueIndex("embedding_inputs_item_modality_chunk_unique").on(
      table.itemId,
      table.modality,
      table.chunkIndex
    ),
  ]
);

// ── Embedding jobs (which model embedded which input, and where) ─────────────
// Every (embedding_input, provider_id) pair becomes one job row. When we
// bring up a new provider, a background worker drains job rows where
// `provider_id = <new>` and `status = 'pending'`. When the migration
// completes, the legacy provider's rows can be dropped.
//
// `destination_table` + `destination_id` points to the actual pgvector row
// (in `items`, `item_chunks`, or a future per-model table). This indirection
// is what lets us change storage layout per model without changing this table.
export const embeddingJobs = pgTable(
  "embedding_jobs",
  {
    id: text("id").primaryKey(),
    inputId: text("input_id")
      .notNull()
      .references(() => embeddingInputs.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    // Provider id from EmbeddingProvider.id, e.g. "gemma-768-v1".
    providerId: text("provider_id").notNull(),
    providerVersion: text("provider_version").notNull(),
    dims: integer("dims").notNull(),
    status: text("status").$type<EmbeddingJobStatus>().notNull().default("pending"),
    // Where the vector ended up. e.g. ("items", "<itemId>") or ("item_chunks", "<chunkId>").
    destinationTable: text("destination_table"),
    destinationId: text("destination_id"),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("embedding_jobs_input_id_idx").on(table.inputId),
    index("embedding_jobs_item_id_idx").on(table.itemId),
    index("embedding_jobs_provider_status_idx").on(table.providerId, table.status),
    uniqueIndex("embedding_jobs_input_provider_unique").on(
      table.inputId,
      table.providerId
    ),
  ]
);

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
  },
  (table) => [index("tags_name_idx").on(table.name)]
);

export const itemTags = pgTable(
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

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

// ── Usage tracking ─────────────────────────────────────────────────────────

export const usageEvents = pgTable(
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
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("usage_events_user_id_idx").on(table.userId),
    index("usage_events_user_type_idx").on(table.userId, table.eventType),
    index("usage_events_user_date_idx").on(table.userId, table.createdAt),
  ]
);

// ── Chat history ───────────────────────────────────────────────────────────
// Threads + messages for the RAG chat UI. Messages are stored in AI SDK
// `UIMessage` shape (id + role + parts[] + optional metadata) so they can
// be handed back to `useChat({ messages: initial })` unchanged.

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("chat_threads_user_id_idx").on(table.userId),
    index("chat_threads_user_updated_idx").on(table.userId, table.updatedAt),
  ]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    // AI SDK UIMessage parts — stored as jsonb so we can query/index
    // into parts later (e.g. filter messages citing a given source).
    parts: jsonb("parts").$type<UIMessagePart<never, never>[]>().notNull(),
    // Message-level metadata (model, usage, etc.). Optional.
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("chat_messages_thread_id_idx").on(table.threadId),
    index("chat_messages_thread_created_idx").on(table.threadId, table.createdAt),
  ]
);

export const apiKey = pgTable("apiKey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull().unique(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: timestamp("lastRefillAt"),
  enabled: boolean("enabled").notNull().default(true),
  rateLimitEnabled: boolean("rateLimitEnabled").notNull().default(false),
  rateLimitTimeWindow: integer("rateLimitTimeWindow"),
  rateLimitMax: integer("rateLimitMax"),
  requestCount: integer("requestCount").notNull().default(0),
  remaining: integer("remaining"),
  lastRequest: timestamp("lastRequest"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
});
