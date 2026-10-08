"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { previewRule, updateRule } from "@/services/rules";

export async function previewRuleAction(id: string, input: unknown) {
  return toResult(async () => previewRule(await appCtx(), id, input));
}

export async function saveRuleAction(id: string, version: number, input: unknown) {
  const res = await toResult(async () => {
    await updateRule(await appCtx(), id, version, input);
  });
  if (res.ok) {
    revalidatePath(`/rules/${id}`);
    revalidatePath("/rules");
  }
  return res;
}
