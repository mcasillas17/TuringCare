// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url)); // apps/web/

it("index.html exposes the crawler share metadata", () => {
  const html = readFileSync(`${root}index.html`, "utf8");
  expect(html).toContain('name="description" content="Understand your dog. Train without force."');
  expect(html).toContain('property="og:title" content="TuringCare"');
  expect(html).toContain(
    'property="og:description" content="Understand your dog. Train without force."',
  );
  expect(html).toContain('property="og:image" content="https://turingcare.dog/og.png"');
  expect(html).toContain('property="og:url" content="https://turingcare.dog/"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
});

it("og.png exists and is within WhatsApp's size budget", () => {
  const png = statSync(`${root}public/og.png`);
  expect(png.isFile()).toBe(true);
  expect(png.size).toBeGreaterThan(0);
  expect(png.size).toBeLessThan(300_000);
});
