import { Hono } from "hono";
import type { Env } from "./bindings";
import { corsMiddleware } from "./middleware/cors";
import saveRoute from "./routes/save";
import searchRoute from "./routes/search";
import itemsRoute from "./routes/items";
import chatRoute from "./routes/chat";
import tagsRoute from "./routes/tags";
import agentRoute from "./routes/agent";
import importRoute from "./routes/import";

export { ProcessItemWorkflow } from "./workflows/process-item";

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", corsMiddleware);

// Routes
app.route("/api/save", saveRoute);
app.route("/api/search", searchRoute);
app.route("/api/items", itemsRoute);
app.route("/api/chat", chatRoute);
app.route("/api/tags", tagsRoute);
app.route("/api/agent", agentRoute);
app.route("/api/import", importRoute);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "internet-mindmap-api" }));

export default app;
