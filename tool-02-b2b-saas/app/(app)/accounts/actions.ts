"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { updateAccountTeam } from "@/services/accounts";

export async function updateTeamAction(id: string, input: unknown) {
  const res = await toResult(async () => updateAccountTeam(await appCtx(), id, input));
  if (res.ok) {
    revalidatePath(`/accounts/${id}`);
    revalidatePath("/accounts");
  }
  return res;
}
