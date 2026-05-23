import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { type AnthropicLike, LLMError } from "./anthropic";

const SYSTEM_PROMPT = `You rewrite a structured dog Behavior Brief into warm, plain-language prose for a professional dog trainer. Use ONLY the facts in the provided brief — do not invent behaviors, numbers, breeds, or events. Do not give veterinary, medical, or diagnostic advice. Keep a positive-reinforcement, encouraging tone. Be concise: a few short paragraphs. Do not add headings the brief doesn't have.`;

export interface PolishBriefDeps {
  client?: AnthropicLike;
  apiKey?: string;
  model?: string;
}

/**
 * Rewrite a deterministic brief summary into prose via Claude. Provider-isolated.
 * No key and no injected client -> LLMError("not_configured"). Any provider or
 * transport failure -> LLMError("failed"). The facts come only from `summary`.
 */
export async function polishBrief(summary: string, deps: PolishBriefDeps = {}): Promise<string> {
  if (!summary.trim()) throw new LLMError("polishBrief: summary is required");

  // `in` check (not `?? env`): tests force not-configured via { apiKey: undefined }
  // without touching env; production callers omit deps -> env.ANTHROPIC_API_KEY.
  const apiKey = "apiKey" in deps ? deps.apiKey : env.ANTHROPIC_API_KEY;
  const model = deps.model ?? env.BRIEF_LLM_MODEL;

  if (!apiKey && !deps.client) {
    throw new LLMError("polishBrief: ANTHROPIC_API_KEY not configured", "not_configured");
  }

  // Narrow seam: the real SDK's messages.create has a wider signature/return
  // than AnthropicLike; the cast is deliberate so callers depend only on the seam.
  const client: AnthropicLike =
    deps.client ?? (new Anthropic({ apiKey }) as unknown as AnthropicLike);

  let msg: { content: Array<{ type: string; text?: string }> };
  try {
    msg = await client.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: summary }],
    });
  } catch (cause) {
    throw new LLMError(
      `polishBrief: provider failure: ${cause instanceof Error ? cause.message : "unknown"}`,
      "failed",
      { cause },
    );
  }

  const text = msg.content.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new LLMError("polishBrief: empty completion", "failed");
  return text;
}
