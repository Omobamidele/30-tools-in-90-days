"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { reevaluateAfterResponse } from "@/services/reevaluate";
import {
  activateContract,
  addClause,
  amendContract,
  confirmClause,
  createContract,
  rejectClause,
  updateClauseInputs,
  updateClauseTerms,
  updateContractDetails,
} from "@/services/contracts";

async function reevaluate(contractId: string) {
  reevaluateAfterResponse((await appCtx()).actor.orgId, { contractId });
}

function refresh(contractId?: string) {
  if (contractId) revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/events", "layout");
  revalidatePath("/deadlines");
}

export async function createContractAction(eventId: string, values: Record<string, unknown>) {
  return toResult(async () => {
    const row = await createContract(await appCtx(), eventId, values);
    refresh();
    return { id: row.id };
  });
}

export async function updateContractAction(contractId: string, values: Record<string, unknown>) {
  return toResult(async () => {
    await updateContractDetails(await appCtx(), contractId, values);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function addClauseAction(contractId: string, values: { type: string; label: string; terms: unknown; inputs?: unknown }) {
  return toResult(async () => {
    await addClause(await appCtx(), contractId, values);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function updateClauseAction(contractId: string, clauseId: string, values: { label: string; terms: unknown }, lockVersion: number) {
  return toResult(async () => {
    await updateClauseTerms(await appCtx(), clauseId, values, lockVersion);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function updateClauseInputsAction(contractId: string, clauseId: string, inputs: unknown) {
  return toResult(async () => {
    await updateClauseInputs(await appCtx(), clauseId, inputs);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function confirmClauseAction(contractId: string, clauseId: string) {
  return toResult(async () => {
    await confirmClause(await appCtx(), clauseId);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function removeClauseAction(contractId: string, clauseId: string) {
  return toResult(async () => {
    await rejectClause(await appCtx(), clauseId);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function activateContractAction(contractId: string) {
  return toResult(async () => {
    await activateContract(await appCtx(), contractId);
    await reevaluate(contractId);
    refresh(contractId);
    return undefined;
  });
}

export async function amendContractAction(contractId: string) {
  return toResult(async () => {
    const row = await amendContract(await appCtx(), contractId);
    refresh(contractId);
    return { id: row.id };
  });
}
