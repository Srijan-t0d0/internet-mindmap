// Run: node --test packages/api/src/ai/llm/chat-model.test.mjs
import assert from "node:assert/strict";
import { generateText } from "ai";
import { createChatModel } from "./chat-model.ts";

const calls = [];
const binding = {
  async run(model, inputs, options) {
    assert.equal(this, binding, "Preserve the original binding receiver");
    calls.push({ model, inputs, options });
    return { response: "Answer", usage: { prompt_tokens: 1, completion_tokens: 1 } };
  },
};
const originalRun = binding.run;
for (const model of ["@cf/qwen/qwen3.8-27b", "@cf/qwen/qwen3-30b-a3b-fp8"]) {
  const result = await generateText({ model: createChatModel(binding, model), prompt: "Hi" });
  assert.equal(result.text, "Answer");
}
assert.equal(calls[0].inputs.reasoning_effort, "low");
assert.equal(calls[0].options.reasoning_effort, undefined);
assert.equal(calls[1].inputs.reasoning_effort, undefined);
assert.equal(binding.run, originalRun);
console.log("Chat reasoning effort reaches Qwen inputs only; original binding unchanged");
