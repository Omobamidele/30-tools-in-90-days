"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { createApiKey, revokeApiKey } from "@/services/keys";
import { createEndpoint, deleteEndpoint, sendTestWebhook } from "@/services/webhooks";
import { importAccounts } from "@/services/accounts";
import { saveQueue } from "@/services/settings";
import { createUser, updateUser } from "@/services/users";

const again = (p: string) => revalidatePath(p);

export async function createKeyAction(input: unknown) {
  const res = await toResult(async () => createApiKey(await appCtx(), input));
  if (res.ok) {
    again("/settings/data");
    again("/settings/crm");
  }
  return res;
}

export async function revokeKeyAction(id: string) {
  const res = await toResult(async () => revokeApiKey(await appCtx(), id));
  if (res.ok) {
    again("/settings/data");
    again("/settings/crm");
  }
  return res;
}

export async function createWebhookAction(input: unknown) {
  const res = await toResult(async () => createEndpoint(await appCtx(), input));
  if (res.ok) again("/settings/crm");
  return res;
}

export async function deleteWebhookAction(id: string) {
  const res = await toResult(async () => deleteEndpoint(await appCtx(), id));
  if (res.ok) again("/settings/crm");
  return res;
}

export async function testWebhookAction(id: string) {
  const res = await toResult(async () => sendTestWebhook(await appCtx(), id));
  again("/settings/crm");
  return res;
}

export async function importAccountsAction(filename: string, rows: Array<Record<string, string>>) {
  const res = await toResult(async () => importAccounts(await appCtx(), filename, rows));
  if (res.ok) {
    again("/settings/imports");
    again("/accounts");
  }
  return res;
}

export async function saveQueueAction(input: unknown) {
  const res = await toResult(async () => saveQueue(await appCtx(), input));
  if (res.ok) again("/settings/routing");
  return res;
}

export async function createUserAction(input: unknown) {
  const res = await toResult(async () => createUser(await appCtx(), input));
  if (res.ok) again("/settings/users");
  return res;
}

export async function updateUserAction(id: string, input: unknown) {
  const res = await toResult(async () => updateUser(await appCtx(), id, input));
  if (res.ok) again("/settings/users");
  return res;
}
