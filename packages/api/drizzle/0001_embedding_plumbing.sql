CREATE TABLE "embedding_inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"modality" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"chunker_id" text NOT NULL,
	"chunker_version" text DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"input_id" text NOT NULL,
	"item_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_version" text NOT NULL,
	"dims" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"destination_table" text,
	"destination_id" text,
	"last_error" text,
	"attempts" integer NOT NULL DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "embedding_inputs" ADD CONSTRAINT "embedding_inputs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_jobs" ADD CONSTRAINT "embedding_jobs_input_id_embedding_inputs_id_fk" FOREIGN KEY ("input_id") REFERENCES "public"."embedding_inputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_jobs" ADD CONSTRAINT "embedding_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "embedding_inputs_item_id_idx" ON "embedding_inputs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "embedding_inputs_content_hash_idx" ON "embedding_inputs" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_inputs_item_modality_chunk_unique" ON "embedding_inputs" USING btree ("item_id","modality","chunk_index");--> statement-breakpoint
CREATE INDEX "embedding_jobs_input_id_idx" ON "embedding_jobs" USING btree ("input_id");--> statement-breakpoint
CREATE INDEX "embedding_jobs_item_id_idx" ON "embedding_jobs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "embedding_jobs_provider_status_idx" ON "embedding_jobs" USING btree ("provider_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_jobs_input_provider_unique" ON "embedding_jobs" USING btree ("input_id","provider_id");
