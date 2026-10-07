"use server";

import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { updatePreferences } from "@/services/users";

export async function savePreferencesAction(input: unknown) {
  return toResult(async () => updatePreferences(await appCtx(), input));
}
