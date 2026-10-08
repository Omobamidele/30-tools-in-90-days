"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { createSupplier } from "@/services/suppliers";

export async function createSupplierAction(values: Record<string, unknown>) {
  return toResult(async () => {
    const row = await createSupplier(await appCtx(), values);
    revalidatePath("/suppliers");
    return { id: row.id, name: row.name, city: row.city };
  });
}
