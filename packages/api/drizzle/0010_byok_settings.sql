CREATE TABLE user_settings (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 chat_model text,
 system_prompt text CHECK (length(system_prompt) <= 2000),
 updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE user_provider_credentials (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('openai','anthropic','google','openrouter')),
 ciphertext text NOT NULL,
 iv text NOT NULL,
 key_version integer NOT NULL,
 last4 text NOT NULL,
 status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','invalid')),
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX user_provider_credentials_user_provider_unique ON user_provider_credentials(user_id, provider);
