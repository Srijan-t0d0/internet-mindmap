import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { Env, Variables } from "../bindings";
import { saveInput, saveItem } from "../lib/save-item";

const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  .post("/", zValidator("json", saveInput), async (c) => {
    const result = await saveItem(c.env, c.get("userId"), c.req.valid("json"), {
      requestId: c.get("requestId"), waitUntil: (task) => c.executionCtx.waitUntil(task),
    });
    return c.json(result, 201);
  });
export default app;
