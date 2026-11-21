import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyRule } from "./categories";

export function RuleCard({ proposal }: { proposal: { pattern: string; category: string; is_new_category: boolean; matching_count: number } }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "busy" | "done" | "no">("idle");
  async function confirm() {
    setState("busy");
    try {
      const n = await applyRule(proposal.pattern, proposal.category);
      toast.success(`Правилото е записано. Променени ${n} плащания.`);
      setState("done");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
      setState("idle");
    }
  }
  return (
    <div className="my-2 whitespace-normal rounded-xl border bg-muted p-4 text-sm">
      <p className="font-semibold">Предложено правило</p>
      <p className="mt-1">Когато пише „{proposal.pattern}“ → <b>{proposal.category}</b>{proposal.is_new_category ? " (нова категория)" : ""}</p>
      <p className="text-muted-foreground">Засяга {proposal.matching_count} съществуващи плащания и всички бъдещи.</p>
      {state === "done" ? <p className="mt-2 text-primary">✓ Потвърдено</p> : state === "no" ? <p className="mt-2 text-muted-foreground">Отказано</p> : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={confirm} disabled={state === "busy"}>Потвърди</Button>
          <Button size="sm" variant="ghost" onClick={() => setState("no")}>Откажи</Button>
        </div>
      )}
    </div>
  );
}
