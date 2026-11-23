// UI contract checks against explicit fixtures. Hosted integration is a separate release gate.
// PLAYWRIGHT_MODULE may point to the desktop bundled Playwright package.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.UI_OUTPUT || "test-results";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : { channel: "msedge" }),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const manager = "00000000-0000-0000-0000-000000000001",
  member = "00000000-0000-0000-0000-000000000002";
const people = [
  { id: manager, display_name: "STC Manager", role: "manager", active: true },
  { id: member, display_name: "Team Member", role: "member", active: true },
];
let tasks = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    title: "Brand campaign design",
    description: "Create the visual direction for the next STC campaign.",
    assignee_id: member,
    due_date: "2026-11-25",
    planned_for: null,
    priority: "high",
    status: "waiting_review",
    submission_note: "Design ready for review",
    review_note: "",
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
let authenticatedAs = manager;
await page.route(
  "https://mkhzwcuwirivrnrnrxoo.supabase.co/**",
  async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      table = url.pathname.split("/").pop(),
      method = req.method();
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    let data = [];
    if (url.pathname.includes("/auth/v1/token")) {
      const body = req.postDataJSON();
      authenticatedAs = body.email === "member@example.com" ? member : manager;
      const user = {
        id: authenticatedAs,
        aud: "authenticated",
        role: "authenticated",
        email: body.email,
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      const token = [
        { alg: "HS256", typ: "JWT" },
        {
          sub: authenticatedAs,
          exp: Math.floor(Date.now() / 1000) + 3600,
          role: "authenticated",
        },
        "fixture",
      ]
        .map((x) =>
          typeof x === "string"
            ? x
            : Buffer.from(JSON.stringify(x)).toString("base64url"),
        )
        .join(".");
      data = {
        access_token: token,
        refresh_token: "fixture-refresh",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
    } else if (table === "stc_members") {
      data = url.searchParams.has("id")
        ? people.find((p) => p.id === authenticatedAs)
        : authenticatedAs === manager
          ? people
          : [people[1]];
    } else if (table === "stc_tasks") {
      if (method === "POST") {
        const body = req.postDataJSON();
        tasks.push({
          ...tasks[0],
          ...body,
          id: crypto.randomUUID(),
          status: "todo",
        });
      }
      if (method === "PATCH") {
        const body = req.postDataJSON();
        const id = url.searchParams.get("id")?.slice(3);
        tasks = tasks.map((t) =>
          t.id === id ? { ...t, ...body, version: t.version + 1 } : t,
        );
        data = [{ id }];
      } else
        data =
          authenticatedAs === manager
            ? tasks
            : tasks.filter((t) => t.assignee_id === member);
    }
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "*",
    };
    return route.fulfill({ status: 200, headers, body: JSON.stringify(data) });
  },
);
try {
  await page.goto("http://localhost:3100");
  await page.getByRole("heading", { name: "أهلًا بعودتك" }).waitFor();
  await page.screenshot({ path: output + "/stc-login-ar.png", fullPage: true });
  await page.getByRole("button", { name: "English", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("dir"), "ltr");
  await page.getByLabel("Email address").fill("manager@example.com");
  await page.getByLabel("Password", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Let’s move work forward" })
    .waitFor();
  await page.getByRole("heading", { name: "Brand campaign design" }).waitFor();
  await page.screenshot({ path: output + "/stc-board-en.png", fullPage: true });
  await page.getByRole("heading", { name: "Brand campaign design" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Review note").fill("Approved for delivery");
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".status-pill.approved"),
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(tasks[0].status, "approved");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("New campaign task");
  await page.getByLabel("Description").fill("A fresh task for the team");
  await page.getByRole("button", { name: "Assign task", exact: true }).click();
  await page.getByRole("heading", { name: "New campaign task" }).waitFor();
  await page.getByRole("button", { name: "العربية", exact: true }).click();
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
  await page.screenshot({ path: output + "/stc-board-ar.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: output + "/stc-mobile-ar.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "التقارير", exact: true }).click();
  await page.getByRole("heading", { name: "متابعة أداء الفريق" }).waitFor();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "الأرشيف التاريخي", exact: true })
    .click();
  await page.getByRole("heading", { name: "التاريخ المحفوظ" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Arabic/English, RTL/LTR, sign-in, assignment, manager approval, reports, archive screen, mobile overflow; fixture-backed UI checks.",
  );
} finally {
  await browser.close();
}
