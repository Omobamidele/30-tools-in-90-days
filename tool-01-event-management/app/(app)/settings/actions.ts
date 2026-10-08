"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { createUser, saveSettings, sendTestEmail, setUserActive, setUserRole, type SettingsSection } from "@/services/settings";
import { upsertFx } from "@/services/fx";
import type { RoleKey } from "@/config/schema";

export async function saveSettingsAction(section: SettingsSection, values: unknown) {
  return toResult(async () => {
    await saveSettings(await appCtx(), section, values);
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function createUserAction(values: Record<string, unknown>) {
  return toResult(async () => {
    const res = await createUser(await appCtx(), values);
    revalidatePath("/settings");
    return res;
  });
}

export async function setUserRoleAction(userId: string, role: RoleKey) {
  return toResult(async () => {
    await setUserRole(await appCtx(), userId, role);
    revalidatePath("/settings");
    return undefined;
  });
}

export async function setUserActiveAction(userId: string, active: boolean) {
  return toResult(async () => {
    await setUserActive(await appCtx(), userId, active);
    revalidatePath("/settings");
    return undefined;
  });
}

export async function upsertFxAction(values: Record<string, unknown>) {
  return toResult(async () => {
    await upsertFx(await appCtx(), values);
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function testEmailAction() {
  return toResult(async () => sendTestEmail(await appCtx()));
}
