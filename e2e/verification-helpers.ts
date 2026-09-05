import { randomUUID } from "node:crypto";
import { type Page, expect } from "@playwright/test";

export function localClientHeaders() {
  const hex = randomUUID().replaceAll("-", "");
  const ip = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return { "fly-client-ip": `10.${ip.join(".")}` };
}

export async function confirmEmailOwnership(page: Page, locale: "en" | "es" = "en") {
  await page
    .getByRole("button", {
      name: locale === "es" ? "Verificar correo" : "Verify email",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: locale === "es" ? "Correo verificado" : "Email verified",
      exact: true,
    }),
  ).toBeVisible();
}

/** Exercise Better Auth's real focus-refresh listener without a wall-clock sleep. */
export async function refreshSessionOnFocus(page: Page) {
  await page.clock.install();
  await page.clock.fastForward(6000);
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/get-session",
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
}
