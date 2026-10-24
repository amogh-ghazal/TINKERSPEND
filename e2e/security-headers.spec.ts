import { expect, test } from "@playwright/test";

test("Cloudflare static headers enforce script and frame boundaries", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("script-src 'self' https://accounts.google.com/gsi/client");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("geolocation=()");
  const allowed = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__tinkerspendUnexpectedInlineScript = true";
    document.head.append(script);
    return Reflect.has(window, "__tinkerspendUnexpectedInlineScript");
  });
  expect(allowed).toBe(false);
});
