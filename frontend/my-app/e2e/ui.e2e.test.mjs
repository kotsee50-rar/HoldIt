// Browser test of the running app: bridge on 127.0.0.1:8787 and dev server on localhost:5173
// must already be running (see README). Drives real Chrome with playwright-core.
//
//   npm run test:e2e
//
// Runs one small live sale on Testnet (1.000 TGD). The replays need no ledger.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const APP = process.env.APP_URL || "http://localhost:5173/";
const BRIDGE = process.env.VITE_BRIDGE_URL || "http://127.0.0.1:8787";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let browser;
let page;
const pageErrors = [];

before(async () => {
  try {
    const health = await fetch(`${BRIDGE}/health`);
    const body = await health.json();
    assert.equal(body.online, true, "the bridge must be online for this test (npm run server)");
    // A run left over from a previous test must be finished before we start.
    const waitIdle = async () => {
      for (let i = 0; i < 120; i++) {
        const state = await (await fetch(`${BRIDGE}/health`)).json();
        if (!state.busy) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };
    await waitIdle();
    // Start from a full ladder: the book test expects all ten levels, and earlier runs leave it partly consumed.
    const reset = await fetch(`${BRIDGE}/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(reset.status, 202, "POST /reset must be accepted");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await waitIdle();
  } catch (error) {
    throw new Error(`Bridge not reachable at ${BRIDGE}: ${error.message}`);
  }
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Pronto", { timeout: 15_000 });
}, { timeout: 60_000 });

after(async () => {
  if (browser) await browser.close();
});

const idle = (timeout = 120_000) =>
  page.waitForFunction(() => !document.body.innerText.includes("Run in corso"), null, { timeout });

test("the page shows the bridge as connected and ready", async () => {
  assert.ok(await page.locator("text=Pronto").first().isVisible());
});

test("the order book shows the ten bid levels", async () => {
  await page.waitForSelector("table tbody tr", { timeout: 15_000 });
  assert.equal(await page.locator("table tbody tr").count(), 10);
});

test("the naive replay shows its recorded result", async () => {
  await page.getByRole("button", { name: /Replay naive/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes("100.000 TGD venduti"), null, { timeout: 60_000 });
  assert.match(await page.locator("text=/TGD venduti/").first().textContent(), /^100\.000 TGD venduti/);
  await idle();
});

test("the guarded replay shows its recorded result and log", async () => {
  await page.getByRole("button", { name: /Replay guarded/ }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Risultato:"), null, { timeout: 120_000 });
  assert.match(await page.locator("text=/Risultato:/").first().textContent(), /stato completed/);
  await idle();
});

test("a live naive sale of 1.000 TGD completes and uses the Italian number format", async () => {
  await page.locator("input[type=number]").first().fill("1000");
  await page.getByRole("button", { name: /Market Sell/ }).click();
  // Wait for this sale's own result: the panel still shows the previous replay until then.
  await page.waitForFunction(() => document.body.innerText.includes("1.000 TGD venduti"), null, { timeout: 120_000 });
  assert.match(await page.locator("text=/TGD venduti/").first().textContent(), /^1\.000 TGD venduti/);
  await idle();
});

test("the page raised no JavaScript errors", () => {
  assert.deepEqual(pageErrors, []);
});
