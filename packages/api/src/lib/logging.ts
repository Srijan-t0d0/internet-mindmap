import { initLogger } from "evlog";

// Application privacy policy, not a logger/serializer. Evlog owns serialization,
// cause handling, redaction, event formatting, and request/stream lifecycles.
function redactErrorMessages(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const fields = value as Record<string, unknown>;
  if (typeof fields.name === "string" && typeof fields.message === "string") {
    if (fields.message.startsWith("Failed query:")) fields.message = "Database query failed";
    else if (fields.name.startsWith("AI_")) fields.message = "AI operation failed";
    else if (fields.name === "SyntaxError") fields.message = "Invalid syntax";
    else if (fields.name === "ZodError") fields.message = "Validation failed";
  }
  for (const nested of Object.values(fields)) redactErrorMessages(nested);
}

initLogger({
  env: { service: "internet-mindmap-api" },
  pretty: false,
  minLevel: "info",
  redact: {
    // Restrict built-ins to avoid phone masking changing workflow IDs/timestamps.
    builtins: ["email", "jwt", "bearer"],
    paths: [
      "**.stack", "**.data", "**.internal", "**.headers", "**.params",
      "**.value", "**.text", "**.prompt", "**.responseBody", "**.requestBodyValues",
      "**.rawContent", "**.password", "**.token", "**.secret", "**.authorization", "**.apiKey",
    ],
    patterns: [
      /\b(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/gi,
      /\bBearer\s+[^\s"']+/gi,
      /"(?:password|token|secret|authorization|api[_-]?key)"\s*:\s*"(?:\\.|[^"\\])*"/gi,
      /\b(password|token|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
    ],
    transform: redactErrorMessages,
  },
});
