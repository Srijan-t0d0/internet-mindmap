import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../../bindings";

export function createChatModel(ai: Env["AI"], model: string) {
  // Provider settings go into run options, not model inputs. Inject effort at
  // the binding boundary so Cloudflare actually receives it in the request.
  const binding = Object.create(ai) as Env["AI"];
  binding.run = ((id, inputs, options) => ai.run(
    id,
    (String(id) === "@cf/qwen/qwen3.8-27b"
      ? { ...(inputs as Record<string, unknown>), reasoning_effort: "low" }
      : inputs) as typeof inputs,
    options,
  )) as Env["AI"]["run"];
  return createWorkersAI({ binding })(model);
}
