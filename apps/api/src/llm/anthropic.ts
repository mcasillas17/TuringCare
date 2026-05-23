/** Minimal seam over the Anthropic SDK so the provider is swappable + testable. */
export interface AnthropicLike {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      temperature?: number;
      system?: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

/** Dedicated error. `code` lets the route map not_configured -> 503, failed -> 502. */
export class LLMError extends Error {
  code: "not_configured" | "failed";
  constructor(
    message: string,
    code: "not_configured" | "failed" = "failed",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "LLMError";
    this.code = code;
  }
}
