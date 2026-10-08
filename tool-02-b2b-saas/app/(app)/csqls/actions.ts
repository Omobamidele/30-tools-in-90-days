"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { acceptCsql, closeNoOpp, loseCsql, reassignCsql, recordOpportunity, rerouteCsql, returnCsql, winCsql } from "@/services/csqls";

type Act = "ACCEPT" | "RETURN" | "REROUTE" | "REASSIGN" | "RECORD_OPPORTUNITY" | "WIN" | "LOSE" | "CLOSE_NO_OPP";

/** One entry point for every CSQL move; the service and state machine decide what's allowed. */
export async function csqlAction(id: string, lockVersion: number, action: Act, input: unknown) {
  const res = await toResult(async () => {
    const ctx = await appCtx();
    switch (action) {
      case "ACCEPT":
        return acceptCsql(ctx, id, lockVersion).then(() => undefined);
      case "RETURN":
        return returnCsql(ctx, id, lockVersion, input).then(() => undefined);
      case "REROUTE":
        return rerouteCsql(ctx, id, lockVersion, input).then(() => undefined);
      case "REASSIGN":
        return reassignCsql(ctx, id, lockVersion, input).then(() => undefined);
      case "RECORD_OPPORTUNITY":
        return recordOpportunity(ctx, id, lockVersion, input).then(() => undefined);
      case "WIN":
        return winCsql(ctx, id, lockVersion, input).then(() => undefined);
      case "LOSE":
        return loseCsql(ctx, id, lockVersion, input).then(() => undefined);
      case "CLOSE_NO_OPP":
        return closeNoOpp(ctx, id, lockVersion, input).then(() => undefined);
    }
  });
  if (res.ok) {
    revalidatePath(`/csqls/${id}`);
    revalidatePath("/csqls");
    revalidatePath("/");
  }
  return res;
}
