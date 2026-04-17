import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import type { Env } from "../bindings";

export function getDb(env: Pick<Env, "DATABASE_URL">) {
  return drizzle(neon(env.DATABASE_URL), { schema });
}
