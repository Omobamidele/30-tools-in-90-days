"use server";

import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { toResult, DomainError } from "@/services/errors";
import { respondToApproval } from "@/services/changes";
import { clientIp, isRateLimited } from "@/services/rate-limit";

export async function respondAction(token: string, values: Record<string, unknown>) {
  return toResult(async () => {
    const h = await headers();
    const ip = clientIp(h);
    // Per IP, and per link so one link can't be hammered from many addresses.
    if (isRateLimited(`approve:${ip}`, 20, 10 * 60_000) || isRateLimited(`approve-token:${token}`, 30, 10 * 60_000)) throw new DomainError("CONFLICT", "Too many attempts. Wait a few minutes and try again.");
    return respondToApproval(getDb(), token, values, { ip: ip === "unknown" ? null : ip, userAgent: h.get("user-agent") }, new Date());
  });
}
