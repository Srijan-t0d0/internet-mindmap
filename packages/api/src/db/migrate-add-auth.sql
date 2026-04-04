-- Better Auth tables for Google OAuth + API key plugin

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image"         TEXT,
  "createdAt"     INTEGER NOT NULL,
  "updatedAt"     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT PRIMARY KEY,
  "expiresAt"   INTEGER NOT NULL,
  "token"       TEXT NOT NULL UNIQUE,
  "createdAt"   INTEGER NOT NULL,
  "updatedAt"   INTEGER NOT NULL,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                      TEXT PRIMARY KEY,
  "accountId"               TEXT NOT NULL,
  "providerId"              TEXT NOT NULL,
  "userId"                  TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"             TEXT,
  "refreshToken"            TEXT,
  "idToken"                 TEXT,
  "accessTokenExpiresAt"    INTEGER,
  "refreshTokenExpiresAt"   INTEGER,
  "scope"                   TEXT,
  "password"                TEXT,
  "createdAt"               INTEGER NOT NULL,
  "updatedAt"               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  INTEGER NOT NULL,
  "createdAt"  INTEGER,
  "updatedAt"  INTEGER
);

-- API key plugin table (used by the Chrome extension)
CREATE TABLE IF NOT EXISTS "apiKey" (
  "id"                  TEXT PRIMARY KEY,
  "name"                TEXT,
  "start"               TEXT,
  "prefix"              TEXT,
  "key"                 TEXT NOT NULL UNIQUE,
  "userId"              TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "refillInterval"      INTEGER,
  "refillAmount"        INTEGER,
  "lastRefillAt"        INTEGER,
  "enabled"             INTEGER NOT NULL DEFAULT 1,
  "rateLimitEnabled"    INTEGER NOT NULL DEFAULT 0,
  "rateLimitTimeWindow" INTEGER,
  "rateLimitMax"        INTEGER,
  "requestCount"        INTEGER NOT NULL DEFAULT 0,
  "remaining"           INTEGER,
  "lastRequest"         INTEGER,
  "expiresAt"           INTEGER,
  "createdAt"           INTEGER NOT NULL,
  "updatedAt"           INTEGER NOT NULL,
  "permissions"         TEXT,
  "metadata"            TEXT
);
