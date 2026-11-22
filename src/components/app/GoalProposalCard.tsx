import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eur } from "@/lib/finance";
import {
  createGoalFromProposal,
  formatPeriod,
  goalSummary,
  type GoalProposal,
} from "@/lib/goals";

export function GoalProposalCard({
  proposal,
  onConfirmed,
}: {
  proposal: GoalProposal;
  onConfirmed: () => void;
}) {
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "busy" | "done" | "no">("idle");

  async function confirm() {
    setState("busy");
    try {
      await createGoalFromProposal(proposal);
      await qc.invalidateQueries({ queryKey: ["financial-goals"] });
      setState("done");
      toast.success("Целта е записана в „Финансови цели“.");
      onConfirmed();
    } catch (error) {
      toast.error((error as Error).message);
      setState("idle");
    }
  }

  return (
    <div className="my-2 whitespace-normal rounded-xl border bg-muted p-4 text-sm">
      <div className="flex items-start gap-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div>
          <p className="font-semibold">{proposal.name}</p>
          <p className="mt-1">{goalSummary(proposal)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Данни за периода {formatPeriod(proposal.analysis_period)}
      </p>
      <p className="mt-2">{proposal.explanation}</p>
      {proposal.goal_type === "monthly_limit" && proposal.current_month_spending !== null && (
        <p className="mt-2 text-muted-foreground">
          Похарчено в тази категория през текущия месец: {eur(proposal.current_month_spending)}.
        </p>
      )}
      {proposal.monthly_required !== null && (
        <p className="mt-2 font-medium">Необходимо заделяне: {eur(proposal.monthly_required)} на месец.</p>
      )}
      {proposal.insufficient_data && (
        <p className="mt-2 rounded-lg bg-background p-2 text-muted-foreground">
          Няма достатъчно транзакции за препоръка, основана на разходите ви. Изчислението по цел и срок
          остава точно.
        </p>
      )}
      <p className="mt-2"><span className="font-medium">Следваща стъпка:</span> {proposal.next_step}</p>
      {state === "done" ? (
        <p className="mt-3 text-primary">✓ Целта е записана</p>
      ) : state === "no" ? (
        <p className="mt-3 text-muted-foreground">Предложението е отказано и не е записано.</p>
      ) : proposal.can_confirm ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={confirm} disabled={state === "busy"}>
            {state === "busy" ? "Записвам…" : "Потвърди целта"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("no")} disabled={state === "busy"}>
            Откажи
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground">{proposal.next_step}</p>
      )}
    </div>
  );
}
