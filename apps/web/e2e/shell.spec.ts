import { expect, test } from "@playwright/test";

test("shell: banner, nav, footer notice and renderer attribute", async ({ page }) => {
  await page.goto("/?renderer=2d");
  await expect(page.locator("html")).toHaveAttribute("data-renderer", "2d");
  await expect(page.locator("#banner")).toContainText("Sample register");
  await expect(page.locator("footer")).toContainText("Evidence, not legal advice.");
  await expect(page.locator('.nav a[data-nav="check"]')).toHaveAttribute("aria-current", "page");
  await page.click('.nav a[data-nav="vendors"]');
  await expect(page).toHaveURL(/\/vendors$/);
  await expect(page.locator('.nav a[data-nav="vendors"]')).toHaveAttribute("aria-current", "page");
  await page.goto("/no-such-page?renderer=2d");
  await expect(page.locator("#app")).toContainText("nothing at this address");
});
