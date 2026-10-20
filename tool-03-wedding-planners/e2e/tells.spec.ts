import { test, expect, type Page } from "@playwright/test";

// Scans every screen for the "vibe-coded" tells listed in the research checklist and DESIGN.md.
const PAGES = ["/today", "/enquiries", "/enquiries?open=e02", "/follow-ups", "/referrals", "/settings"];
const HYPE = /\b(seamless(ly)?|supercharge|transform(ative)?|elevate|unlock|effortless(ly)?|cutting-edge|delve|revolutioni[sz]e)\b/i;

async function fresh(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(path);
  await page.waitForTimeout(800);
}

for (const path of PAGES) {
  test(`no vibe-coded tells on ${path}`, async ({ page }) => {
    await fresh(page, path);
    const r = await page.evaluate((hypeSrc) => {
      const els = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => e.getClientRects().length);
      const css = (e: Element) => getComputedStyle(e);
      const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) || []).map(Number);
      const isBrand = (s: string) => { const [r, g, b, a = 1] = rgb(s); return a > 0 && Math.abs(r - 84) < 4 && Math.abs(g - 35) < 4 && Math.abs(b - 231) < 4; };
      const purpleish = (s: string) => { const [r, g, b, a = 1] = rgb(s); return a > 0.02 && b > 150 && b - g > 60 && r < b; };
      const text = document.body.innerText;
      const out: Record<string, string[]> = { gradients: [], gradientText: [], blur: [], glow: [], caps: [], leftBorder: [], panelShadow: [], pointer: [], arrows: [], purple: [], fonts: [], icons: [] };
      for (const e of els) {
        const s = css(e); const tag = e.tagName.toLowerCase(); const id = `${tag}.${String(e.className).slice(0, 50)}`;
        if (s.backgroundImage.includes("gradient")) out.gradients.push(id);
        if ((s as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip === "text" || s.backgroundClip === "text") out.gradientText.push(id);
        if (s.backdropFilter !== "none" && s.backdropFilter) out.blur.push(id);
        if (s.boxShadow !== "none" && /rgba?\((\d+), ?(\d+), ?(\d+)/.test(s.boxShadow) && purpleish(s.boxShadow)) out.glow.push(id);
        const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join("").trim();
        if (own.length > 3 && /[a-z]/i.test(own) && (s.textTransform === "uppercase" || (own === own.toUpperCase() && /[A-Z]{4,}/.test(own) && !/^[A-Z]{2,4}-\d+$/.test(own)))) {
          if (!/^(ENQ|CPL)-/.test(own) && !/^[A-Z]{2}$/.test(own)) out.caps.push(`${id} "${own}"`);
        }
        const bl = parseFloat(s.borderLeftWidth), br = parseFloat(s.borderRightWidth);
        if (bl >= 2 && bl > br && s.borderLeftStyle !== "none" && e.offsetHeight > 24) out.leftBorder.push(id);
        if (s.boxShadow !== "none" && !e.closest("[role=dialog],[data-sonner-toast],[data-testid=sheet]") && !/focus/.test(String(e.className))) out.panelShadow.push(`${id} ${s.boxShadow}`);
        const clickable = e.closest("a[href],button,select,summary,label[for],input,textarea,[role=tab],[role=button],tr.cursor-pointer,[data-row],[data-oid]");
        if (s.cursor === "pointer" && !clickable) out.pointer.push(id);
        if (tag === "button" && /→|->/.test(e.innerText)) out.arrows.push(id);
        for (const prop of ["backgroundColor", "color", "borderTopColor", "fill"] as const) {
          const v = s[prop] as string;
          if (purpleish(v) && !isBrand(v)) out.purple.push(`${id} ${prop} ${v}`);
          if (isBrand(v) && prop === "backgroundColor" && !e.closest("button[data-action=new-enquiry],button[type=submit],[data-variant=primary]") && !/bg-brand/.test(String(e.className))) out.purple.push(`${id} bg brand outside allowed`);
        }
        if (!/Figtree|monospace|ui-monospace/i.test(s.fontFamily)) out.fonts.push(`${id} ${s.fontFamily}`);
        if (tag === "svg" && /lucide/.test(String(e.getAttribute("class")))) out.icons.push(id);
      }
      // brand background allowed on: logo mark, nav indicator, primary buttons only
      const brandBg = els.filter((e) => isBrand(getComputedStyle(e).backgroundColor)).map((e) => e.tagName.toLowerCase() + (e.getAttribute("aria-hidden") ? "[deco]" : "") + (e.closest("button") ? "[btn]" : ""));
      const ff = getComputedStyle(document.body).fontFamily;
      return {
        out, brandBg, ff,
        emoji: /\p{Extended_Pictographic}/u.test(text), emDash: text.includes("—"), middot: text.includes(" · "), hype: (text.match(new RegExp(hypeSrc, "i")) || [""])[0],
        demoPill: /demo data/i.test(document.querySelector("main")?.innerText || "") && location.pathname !== "/settings",
        kpiGrid: [...document.querySelectorAll("main *")].some((e) => { const s = getComputedStyle(e); return s.display === "grid" && s.gridTemplateColumns.split(" ").length >= 3 && e.children.length >= 3 && [...e.children].every((c) => /\d/.test((c as HTMLElement).innerText) && (c as HTMLElement).innerText.length < 120); }),
        fadeUp: [...document.getAnimations()].map((a) => (a as CSSAnimation).animationName).filter((n) => n && !/sheet-in|enter|exit|sonner|swipe/i.test(n)),
      };
    }, HYPE.source);
    expect(r.ff).toMatch(/Figtree/);
    for (const [k, v] of Object.entries(r.out)) expect(v, k).toEqual([]);
    for (const b of r.brandBg) expect(["span[deco]", "button[btn]", "span[deco][btn]"]).toContain(b);
    expect(r.brandBg.length, "brand used sparingly").toBeLessThanOrEqual(4);
    expect(r.emoji, "emoji").toBe(false);
    expect(r.emDash, "em dash").toBe(false);
    expect(r.middot, "middle-dot meta strings").toBe(false);
    expect(r.hype, "hype words").toBe("");
    expect(r.demoPill, "Demo data pill in the main view").toBe(false);
    expect(r.kpiGrid, "KPI card grid").toBe(false);
    expect(r.fadeUp, "entrance animations").toEqual([]);
  });
}

test("every visible button does something (no dead buttons)", async ({ page }) => {
  await fresh(page, "/today");
  const dead = await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("main button:not(:disabled)")].filter((b) => b.getClientRects().length && !b.onclick && !Object.keys(b).some((k) => k.startsWith("__reactProps") && (b as unknown as Record<string, { onClick?: unknown; type?: string }>)[k].onClick) && b.type !== "submit" && !b.closest("[data-state]") && !b.hasAttribute("aria-haspopup") && !b.hasAttribute("aria-controls")).map((b) => b.outerHTML.slice(0, 80)));
  expect(dead).toEqual([]);
});

test("state survives refresh and Back; toast repeats the button verb", async ({ page }) => {
  await fresh(page, "/enquiries");
  await page.getByRole("radio", { name: /Booked/ }).click();
  await expect(page).toHaveURL(/view=booked/);
  await page.getByRole("button", { name: /^Couple/ }).click();
  await expect(page).toHaveURL(/sort=couple\.asc/);
  await page.reload(); await page.waitForTimeout(700);
  await expect(page.getByRole("radio", { name: /Booked/ })).toHaveAttribute("data-state", "on");
  await expect(page.locator("th[aria-sort=ascending]")).toContainText("Couple");
  await page.goto("/enquiries?open=e02"); await page.waitForTimeout(700);
  await page.getByTestId("sheet").locator('[data-action="reply"]').click();
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("Reply marked as sent");
  await page.goBack();
  await expect(page).toHaveURL(/view=booked/);
});

test("loading state keeps the layout still (no shift)", async ({ page }) => {
  await page.goto("/enquiries");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const before = await page.locator("main table").first().boundingBox();
  await page.waitForTimeout(800);
  const after = await page.locator("main table").first().boundingBox();
  expect(Math.abs((before?.y ?? 0) - (after?.y ?? 0))).toBeLessThan(2);
});

test("focus ring is visible and dialogs trap focus and return it", async ({ page }) => {
  await fresh(page, "/enquiries");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe("none");
  const trigger = page.locator('[data-action="new-enquiry"]');
  await trigger.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
