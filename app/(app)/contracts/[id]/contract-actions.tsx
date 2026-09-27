"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { useAction } from "@/ui/use-action";
import { activateContractAction, amendContractAction } from "../actions";

export function ContractActions({
  contractId,
  status,
  canActivate,
  activateBlockedReason,
  canEdit,
}: {
  contractId: string;
  status: string;
  canActivate: boolean;
  activateBlockedReason: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const activate = useAction(activateContractAction);
  const amend = useAction(amendContractAction);
  if (!canEdit) return null;
  const error = activate.error ?? amend.error;

  return (
    <>
      {status === "DRAFT" || status === "IN_REVIEW" ? (
        <Button
          variant="primary"
          disabled={!canActivate || activate.pending}
          title={activateBlockedReason ?? undefined}
          onClick={async () => (await activate.run(contractId)).ok && router.refresh()}
        >
          Activate contract
        </Button>
      ) : null}
      {status === "ACTIVE" ? (
        <Button
          disabled={amend.pending}
          onClick={async () => {
            const res = await amend.run(contractId);
            if (res.ok) router.push(`/contracts/${res.data.id}`);
          }}
        >
          Record amendment
        </Button>
      ) : null}
      {error ? <p className="w-full text-right text-meta text-risk">{error}</p> : null}
      {activateBlockedReason && (status === "DRAFT" || status === "IN_REVIEW") ? (
        <p className="w-full text-right text-meta text-muted">{activateBlockedReason}</p>
      ) : null}
    </>
  );
}
