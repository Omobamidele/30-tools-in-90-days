import { test, expect, type Page } from "@playwright/test";

async function fresh(page: Page, path = "/today") {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(path);
  await expect(page.locator("#search, [data-testid=sidebar]").first()).toBeAttached();
  await page.waitForTimeout(700);
}

test("Today queue is in priority order and month line is right", async ({ page }) => {
  await fresh(page);
  const who = await page.getByTestId("who").allInnerTexts();
  const firsts = who.map((w) => w.split(" ")[0]);
  expect(firsts).toEqual(["Grace", "Maya", "Amelia", "Freya", "Ruby", "Lucy", "Aisha"]);
  await expect(page.getByText("40 min").first()).toBeVisible();
  await expect(page.getByText("3 of 5").first()).toBeVisible();
});

test("reply flow: date check, draft, persists after reload", async ({ page }) => {
  await fresh(page, "/enquiries?open=e02");
  const sheet = page.getByTestId("sheet");
  await expect(sheet.getByTestId("date-check")).toContainText("Hartwell Manor is already ours");
  await expect(sheet.locator("#draft")).toHaveValue(/^Hi Grace & Owen[\s\S]*fully booked/);
  await expect(sheet.locator('[data-action="quote"]')).toBeDisabled();
  await sheet.locator('[data-action="reply"]').click();
  await expect(page.getByText(/reply/i).last()).toBeVisible();
  await expect(sheet.getByTestId("history")).toContainText("First reply sent");
  await page.reload();
  await expect(page.getByTestId("sheet").getByTestId("history")).toContainText("First reply sent");
});

test("quote nudge on day 3", async ({ page }) => {
  await fresh(page, "/enquiries?open=e06");
  const sheet = page.getByTestId("sheet");
  await expect(sheet.locator("#draft")).toHaveValue(/checking the quote came through/);
  await sheet.locator('[data-action="nudge"]').click();
  await expect(sheet.getByTestId("steps")).toContainText("Day 3 sent");
  await expect(sheet.locator('[data-action="nudge"]')).toBeDisabled();
});

test("new enquiry: validation, live check, duplicate", async ({ page }) => {
  await fresh(page, "/enquiries");
  await page.locator('[data-action="new-enquiry"]').first().click();
  const dlg = page.getByRole("dialog");
  await dlg.locator("#f-guests").fill("12.5");
  await dlg.getByRole("button", { name: /add enquiry/i }).click();
  await expect(dlg.locator("#f-couple-error")).toContainText("Add the couple");
  await expect(dlg.locator("#f-guests-error")).toContainText("whole number");
  await dlg.locator("#f-guests").fill("90");
  await dlg.locator("#f-weddingDate").fill("2026-10-31");
  await expect(dlg.locator("#liveCheck")).toContainText("Fully booked");
  await dlg.locator("#f-weddingDate").fill("2027-07-17");
  await expect(dlg.locator("#liveCheck")).toContainText("Date is free");
  await dlg.locator("#f-couple").fill("Ada Obi & Tunde Bello");
  await dlg.getByRole("button", { name: /add enquiry/i }).click();
  await expect(page.getByTestId("sheet-title")).toHaveText("Ada Obi & Tunde Bello");
  await page.keyboard.press("Escape");
  await page.locator('[data-action="new-enquiry"]').first().click();
  const d2 = page.getByRole("dialog");
  await d2.locator("#f-couple").fill("Tunde Bello & Ada Obi");
  await d2.locator("#f-receivedAt").fill("2026-10-20T09:25");
  await d2.getByRole("button", { name: /add enquiry/i }).click();
  await expect(d2.locator("#dupWarn")).toContainText("Possible duplicate: Ada Obi");
  await d2.getByRole("button", { name: "Add anyway" }).click();
  await expect(page.getByTestId("sheet-title")).toHaveText("Tunde Bello & Ada Obi");
});

test("search, filters, keyboard", async ({ page }) => {
  await fresh(page, "/enquiries");
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  await page.locator("#search").fill("hartwell");
  await expect(page).toHaveURL(/q=hartwell/);
  await expect(page.locator("[data-row]")).toHaveCount(1);
  await page.locator("#search").fill("zzzz-nobody");
  await expect(page.getByTestId("empty")).toBeVisible();
  await page.goto("/enquiries?view=booked");
  await expect(page.locator("[data-row]")).toHaveCount(5);
  await page.goto("/enquiries?view=booked&channel=ref");
  await expect(page.locator("[data-row]")).toHaveCount(3);
  await page.locator("[data-row]").first().click();
  await expect(page.getByTestId("sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sheet")).toHaveCount(0);
});

test("Today row opens record; leaving the page closes it", async ({ page }) => {
  await fresh(page);
  await page.locator('[data-oid="e09"] [data-action="open"]').click();
  await expect(page.getByTestId("sheet-title")).toContainText("Freya");
  await expect(page.locator("#draft")).toHaveValue(/hold it for you/);
  await page.keyboard.press("Escape");
  await page.getByTestId("sidebar").getByRole("link", { name: /Enquiries/ }).click();
  await expect(page.getByTestId("sheet")).toHaveCount(0);
});

test("referral ask for a past couple", async ({ page }) => {
  await fresh(page, "/referrals");
  await page.locator('[data-action="write"][data-id="p4"]').click();
  await expect(page.locator("#draft")).toHaveValue(/^Hi Lucy & Seán[\s\S]*Hartwell Manor/);
  await page.locator('[data-action="sent"]').click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Asked, reminder on/).first()).toBeVisible();
});

test("booking frees the live check counter", async ({ page }) => {
  await fresh(page, "/enquiries?open=e01");
  await page.getByTestId("sheet").locator('[data-action="booked"]').click();
  const confirm = page.getByRole("button", { name: /confirm|mark as booked/i });
  if (await confirm.count()) await confirm.first().click();
  await page.keyboard.press("Escape");
  await page.locator('[data-action="new-enquiry"]').first().click();
  await page.locator("#f-weddingDate").fill("2027-06-05");
  await expect(page.locator("#liveCheck")).toContainText("1 of 2 slots left (Maya & Sam booked)");
});

test("guardrails: Figtree, no gradients, no emoji, no placeholder copy, labelled controls", async ({ page }) => {
  for (const p of ["/today", "/enquiries", "/follow-ups", "/referrals", "/settings"]) {
    await fresh(page, p);
    const r = await page.evaluate(() => {
      const els = [...document.querySelectorAll("*")];
      const grad = els.filter((e) => getComputedStyle(e).backgroundImage.includes("gradient")).length;
      const text = document.body.innerText;
      const unnamed = [...document.querySelectorAll("button, a, input, select, textarea")].filter((e) => {
        const el = e as HTMLElement;
        if (el.offsetParent === null) return false;
        const id = el.id && document.querySelector(`label[for="${el.id}"]`);
        return !(el.getAttribute("aria-label") || el.innerText.trim() || id || el.getAttribute("title") || el.getAttribute("aria-labelledby"));
      }).map((e) => e.outerHTML.slice(0, 80));
      return { grad, font: getComputedStyle(document.body).fontFamily, emoji: /\p{Extended_Pictographic}/u.test(text), lorem: /lorem|ipsum|TODO|placeholder/i.test(text), unnamed };
    });
    expect(r.grad, p).toBe(0);
    expect(r.font).toMatch(/Figtree/i);
    expect(r.emoji, p).toBe(false);
    expect(r.lorem, p).toBe(false);
    expect(r.unnamed, p).toEqual([]);
  }
});

test("no horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/today", "/enquiries", "/follow-ups", "/referrals"]) {
    await fresh(page, p);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(over, p).toBe(false);
  }
});
