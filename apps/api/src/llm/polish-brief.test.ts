import { describe, expect, it, vi } from "vitest";
import type { AnthropicLike } from "./anthropic";
import { LLMError } from "./anthropic";
import { polishBrief } from "./polish-brief";

const SUMMARY = "Behavior Brief — Rex\nConcerns:\n- pulls on leash (moderate)";

function fakeClient(text: string): AnthropicLike {
  return { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text }] }) } };
}

describe("polishBrief", () => {
  it("throws not_configured when no api key and no client", async () => {
    await expect(polishBrief(SUMMARY, { apiKey: undefined })).rejects.toMatchObject({
      name: "LLMError",
      code: "not_configured",
    });
  });

  it("returns the model's prose on success", async () => {
    const client = fakeClient("Rex is making steady progress on loose-leash walking.");
    const out = await polishBrief(SUMMARY, { client, apiKey: "sk-x" });
    expect(out).toBe("Rex is making steady progress on loose-leash walking.");
  });

  it("sends the summary as the user message with a fact-locked system prompt", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await polishBrief(SUMMARY, { client: { messages: { create } }, apiKey: "sk-x", model: "m1" });
    const call = create.mock.calls[0];
    if (!call) throw new Error("messages.create was not called");
    const arg = call[0];
    expect(arg.model).toBe("m1");
    expect(arg.messages).toEqual([{ role: "user", content: SUMMARY }]);
    expect(arg.system).toMatch(/only/i);
    expect(arg.system).toMatch(/do not (invent|give)/i);
  });

  it("throws a plain Error (not LLMError) for a blank summary", async () => {
    await expect(polishBrief("   ", { apiKey: "sk-x" })).rejects.toThrow("summary is required");
    await expect(polishBrief("   ", { apiKey: "sk-x" })).rejects.not.toBeInstanceOf(LLMError);
  });

  it("throws LLMError(failed) when the client rejects", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      polishBrief(SUMMARY, { client: { messages: { create } }, apiKey: "sk-x" }),
    ).rejects.toBeInstanceOf(LLMError);
  });

  it("throws LLMError(failed) on an empty completion", async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    await expect(
      polishBrief(SUMMARY, { client: { messages: { create } }, apiKey: "sk-x" }),
    ).rejects.toMatchObject({ code: "failed" });
  });
});
