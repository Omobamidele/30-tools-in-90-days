"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { SupplierForm } from "./supplier-form";

export function NewSupplier({ types }: { types: Array<{ value: string; label: string }> }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        New supplier
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="New supplier">
        <SupplierForm
          compact
          types={types}
          onCancel={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Dialog>
    </>
  );
}
