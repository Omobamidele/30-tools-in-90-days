"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { issueShareLink, revokeShareLink } from "@/services/client-share";

export async function createShareLinkAction(clientId: string) {
  const res = await toResult(async () => {
    const link = await issueShareLink(await appCtx(), clientId, {});
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
  });
  if (res.ok) revalidatePath(`/clients/${clientId}`);
  return res;
}

export async function revokeShareLinkAction(clientId: string, linkId: string) {
  const res = await toResult(async () => revokeShareLink(await appCtx(), linkId));
  if (res.ok) revalidatePath(`/clients/${clientId}`);
  return res;
}
