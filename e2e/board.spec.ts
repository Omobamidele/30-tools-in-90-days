import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// Event pipeline: keyboard drag between stages (column by column), and a refused illegal move.
// Mutates the demo: reseed afterwards (see playwright.config.ts).
test("moves an event between stages with the keyboard and refuses an illegal move", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, "ops@northbeam.test");
  await page.goto("/events");
  const board = page.getByRole("region", { name: "Event pipeline" });
  await expect(board).toBeVisible();

  const card = board.getByRole("button", { name: "Move Solvane Engineering Offsite" });
  await card.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight"); // Contracted → Live
  // Drop only once dnd-kit has announced the new position, as a screen-reader user would.
  await expect(page.getByText(/was moved over droppable area LIVE/)).toBeAttached();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "Solvane Engineering Offsite moved to Live." })).toBeVisible();

  // Live → Planning isn't an allowed transition.
  await page.reload();
  const moved = page.getByRole("region", { name: "Event pipeline" }).getByRole("button", { name: "Move Solvane Engineering Offsite" });
  await moved.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft"); // → Planning
  await expect(page.getByText(/was moved over droppable area PLANNING/)).toBeAttached();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "can't move from Live to Planning" })).toBeVisible();
});
