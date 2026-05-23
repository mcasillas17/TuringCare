import { describe, expect, it } from "vitest";
import { renderBriefEmail } from "./brief-email";

const base = {
  dogName: "Biscuit",
  ownerName: "Miguel",
  message: null as string | null,
  summary: "Behavior: barked at doorbell.\nIntensity: 3.",
};

describe("renderBriefEmail", () => {
  it("subject contains the dog name", () => {
    expect(renderBriefEmail(base).subject).toBe("Behavior Brief: Biscuit");
  });
  it("HTML contains owner name and brief summary", () => {
    const { html } = renderBriefEmail(base);
    expect(html).toContain("Miguel");
    expect(html).toContain("barked at doorbell");
  });
  it("HTML omits blockquote when message is null", () => {
    const { html } = renderBriefEmail({ ...base, message: null });
    expect(html).not.toContain("<blockquote");
  });
  it("HTML includes blockquote when message is present", () => {
    const { html } = renderBriefEmail({ ...base, message: "Hi Sarah" });
    expect(html).toContain("<blockquote");
    expect(html).toContain("Hi Sarah");
  });
  it("text fallback contains the summary verbatim", () => {
    expect(renderBriefEmail(base).text).toContain("barked at doorbell");
  });
  it("escapes HTML in dog name and summary (XSS defense)", () => {
    const { html } = renderBriefEmail({
      ...base,
      dogName: "<script>x</script>",
      summary: "<img src=x>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;script&gt;");
  });
});
