"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { createAgreement, createClient, updateAgreement, updateClient } from "@/services/clients";

export async function createClientAction(values: Record<string, unknown>) {
  return toResult(async () => {
    const row = await createClient(await appCtx(), values);
    revalidatePath("/clients");
    return { id: row.id };
  });
}

export async function updateClientAction(clientId: string, values: Record<string, unknown>) {
  return toResult(async () => {
    await updateClient(await appCtx(), clientId, values);
    revalidatePath(`/clients/${clientId}`);
    return undefined;
  });
}

export async function saveAgreementAction(clientId: string, agreementId: string | null, values: Record<string, unknown>) {
  return toResult(async () => {
    const ctx = await appCtx();
    if (agreementId) await updateAgreement(ctx, agreementId, values);
    else await createAgreement(ctx, clientId, values);
    revalidatePath(`/clients/${clientId}`);
    return undefined;
  });
}
