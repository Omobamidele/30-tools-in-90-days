"use server";

import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { search } from "@/services/search";

export async function searchAction(q: string) {
  return toResult(async () => search(await appCtx(), q));
}
