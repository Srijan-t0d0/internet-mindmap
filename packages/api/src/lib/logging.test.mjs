// Run: node packages/api/src/lib/logging.test.mjs
import assert from "node:assert/strict";
import { log, createLogger } from "evlog";
import "./logging.ts";

const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const records = [];
for (const level of Object.keys(original)) console[level] = (line) => records.push(typeof line === "string" ? JSON.parse(line) : line);
try {
  const databaseError = Object.assign(new Error("connection closed"), { code: "08006" });
  const wrapped = new Error("Failed query: select secret from items\nparams: __private_content__", { cause: databaseError });
  log.error({ event: "database.failed", error: wrapped });
  const normalized = records.at(-1).error;
  assert.equal(normalized.message, "Database query failed");
  assert.equal(normalized.cause.code, "08006");
  assert.equal(normalized.cause.message, "connection closed");
  assert.ok(!JSON.stringify(normalized).includes("__private_content__"));

  log.error({ error: new Error("fetch https://name:password@example.com/sql?token=abc Bearer abc password=xyz") });
  for (const secret of ["name:password", "token=abc", "Bearer abc", "password=xyz"]) {
    assert.ok(!JSON.stringify(records.at(-1)).includes(secret));
  }
  const aiFailure = Object.assign(new Error('Value: {"summary":"__private_page__"}'), {
    name: "AI_TypeValidationError",
    cause: Object.assign(new SyntaxError('Unexpected token in "__private_page__"'), { name: "AI_JSONParseError" }),
    statusCode: 502,
    data: { value: "__private_page__" },
  });
  log.error({ error: aiFailure });
  const aiLog = records.at(-1).error;
  assert.ok(!JSON.stringify(aiLog).includes("__private_page__"));
  assert.equal(aiLog.name, "AI_TypeValidationError");
  assert.equal(aiLog.statusCode, 502);
  assert.equal(aiLog.cause.name, "AI_JSONParseError");

  log.error({ error: new Error(JSON.stringify({ token: 'prefix"__escaped_private__', password: "__json_password__" })) });
  assert.ok(!JSON.stringify(records.at(-1)).includes("__escaped_private__"));
  assert.ok(!JSON.stringify(records.at(-1)).includes("__json_password__"));
  const secrets = { accessToken: "__access__", refresh_token: "__refresh__", ciphertext: "__ciphertext__", codeVerifier: "__verifier__" };
  log.error({ nested: secrets, message: `sk-${"x".repeat(30)} sk-ant-${"y".repeat(30)} AIza${"z".repeat(35)}` });
  const redacted = JSON.stringify(records.at(-1));
  for (const secret of [...Object.values(secrets), "x".repeat(30), "y".repeat(30), "z".repeat(35)]) assert.ok(!redacted.includes(secret));

  const cyclic = new Error("cyclic");
  cyclic.cause = cyclic;
  log.error({ error: cyclic });
  assert.ok(JSON.stringify(records.at(-1)).includes("Circular"));

  const workflowId = "cefb65a8-290e-46d1-81d2-64011d70f835-1789163087681";
  const logger = createLogger({ event: "workflow.step", workflowId, itemId: "item", step: "embed-and-store" });
  logger.error(wrapped);
  logger.emit();
  const record = records.at(-1);
  assert.equal(record.event, "workflow.step");
  assert.equal(record.level, "error");
  assert.equal(record.workflowId, workflowId);
  assert.ok(!Number.isNaN(Date.parse(record.timestamp)));
  assert.equal(record.error.cause.code, "08006");
} finally {
  Object.assign(console, original);
}
console.log("Evlog privacy and error-cause checks passed");
